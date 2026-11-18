import { and, desc, eq, or } from "drizzle-orm";
import { isAdmin, type EveryAppUser } from "@every-app/sdk/server";
import { z } from "zod";
import { db } from "@/db";
import { workflowRuns, workflows } from "@/db/schema";
import { AiOffError, aiStatus, complete, documentBlock, readJson } from "./ai";
import {
  emailsFor,
  ForbiddenError,
  newId,
  NotFoundError,
  now,
  parseJson,
  requireMatter,
} from "./core";
import { matterDocuments } from "./documents";

export const workflowInput = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(200),
    description: z.string().trim().max(1000).default(""),
    instructions: z.string().trim().min(1, "Instructions are required").max(10000),
    slots: z.array(z.string().trim().min(1).max(100)).min(1, "Add at least one document slot").max(10),
    outputFormat: z.enum(["report", "table"]),
    fields: z.array(z.string().trim().min(1).max(100)).max(30).default([]),
    published: z.boolean().default(false),
  })
  .refine((w) => w.outputFormat !== "table" || w.fields.length > 0, "A table needs at least one field");
export const saveWorkflowInput = z.object({ id: z.string().optional(), workflow: workflowInput });
export const runWorkflowInput = z.object({
  matterId: z.string().min(1),
  workflowId: z.string().min(1),
  inputs: z.array(z.object({ slot: z.string(), documentId: z.string().min(1) })).max(10),
  context: z.string().trim().max(4000).default(""),
});

function canManage(user: EveryAppUser, workflow: typeof workflows.$inferSelect) {
  return workflow.authorId === user.id || isAdmin(user);
}

/** Workflows the person may see: their own, published ones, and every one for admins. */
function visible(user: EveryAppUser) {
  return isAdmin(user)
    ? eq(workflows.orgId, user.orgId)
    : and(eq(workflows.orgId, user.orgId), or(eq(workflows.authorId, user.id), eq(workflows.published, true)));
}

export async function listWorkflows(user: EveryAppUser) {
  const rows = await db.select().from(workflows).where(visible(user)).orderBy(workflows.name);
  const emails = await emailsFor(rows.map((r) => r.authorId));
  return rows.map((w) => ({
    id: w.id,
    name: w.name,
    description: w.description,
    published: w.published,
    outputFormat: w.outputFormat,
    slots: parseJson<string[]>(w.slots, []),
    author: emails.get(w.authorId) ?? "",
    canManage: canManage(user, w),
  }));
}

async function workflowFor(user: EveryAppUser, id: string) {
  const [workflow] = await db.select().from(workflows).where(and(eq(workflows.id, id), visible(user)));
  if (!workflow) throw new NotFoundError("Workflow not found");
  return workflow;
}

export async function getWorkflow(user: EveryAppUser, id: string) {
  const w = await workflowFor(user, id);
  if (!canManage(user, w)) throw new ForbiddenError("Only the author or an admin can edit this workflow");
  return {
    id: w.id,
    name: w.name,
    description: w.description,
    instructions: w.instructions,
    slots: parseJson<string[]>(w.slots, []),
    outputFormat: w.outputFormat,
    fields: parseJson<string[]>(w.fields, []),
    published: w.published,
  };
}

export async function saveWorkflow(user: EveryAppUser, input: z.infer<typeof saveWorkflowInput>) {
  const w = input.workflow;
  const values = {
    name: w.name,
    description: w.description,
    instructions: w.instructions,
    slots: JSON.stringify(w.slots),
    outputFormat: w.outputFormat,
    fields: JSON.stringify(w.outputFormat === "table" ? w.fields : []),
    published: w.published,
  };
  if (input.id) {
    const existing = await workflowFor(user, input.id);
    if (!canManage(user, existing)) throw new ForbiddenError("Only the author or an admin can edit this workflow");
    await db.update(workflows).set(values).where(eq(workflows.id, input.id));
    return { id: input.id };
  }
  const id = newId();
  await db.insert(workflows).values({ id, orgId: user.orgId, authorId: user.id, ...values });
  return { id };
}

export async function deleteWorkflow(user: EveryAppUser, id: string) {
  const existing = await workflowFor(user, id);
  if (!canManage(user, existing)) throw new ForbiddenError("Only the author or an admin can delete this workflow");
  await db.delete(workflows).where(eq(workflows.id, id));
}

const SYSTEM = `TASK:workflow
You carry out a legal team's written workflow over the documents provided, following the instructions step by step.
Base everything on the documents and the extra context.`;

/** Runs a workflow over matter documents and keeps the run in the matter's history. */
export async function runWorkflow(user: EveryAppUser, input: z.infer<typeof runWorkflowInput>) {
  await requireMatter(user, input.matterId, "edit");
  const workflow = await workflowFor(user, input.workflowId);
  const slots = parseJson<string[]>(workflow.slots, []);
  const fields = parseJson<string[]>(workflow.fields, []);
  const docs = await matterDocuments(input.matterId, input.inputs.map((i) => i.documentId));
  const chosen = slots.map((slot) => {
    const pick = input.inputs.find((i) => i.slot === slot);
    const doc = docs.find((d) => d.id === pick?.documentId);
    if (!doc) throw new ForbiddenError(`Choose a document for "${slot}"`);
    return { slot, doc };
  });
  // Fails fast with a clear message when no model is set up; nothing is saved.
  const status = await aiStatus();
  if (!status.on) throw new AiOffError(status.message);
  const id = newId();
  await db.insert(workflowRuns).values({
    id,
    matterId: input.matterId,
    workflowId: workflow.id,
    workflowName: workflow.name,
    authorId: user.id,
    status: "running",
    inputs: JSON.stringify(chosen.map(({ slot, doc }) => ({ slot, documentId: doc.id, documentName: doc.name }))),
    context: input.context,
    outputFormat: workflow.outputFormat,
  });
  const prompt = [
    `INSTRUCTIONS:\n${workflow.instructions}`,
    chosen.map(({ slot, doc }) => `Slot "${slot}" is ${doc.name}.`).join("\n"),
    documentBlock(chosen.map(({ doc }) => doc)),
    input.context ? `EXTRA CONTEXT: ${input.context}` : "",
    workflow.outputFormat === "table"
      ? `FIELDS: ${fields.join(" | ")}\nReply with JSON only: {"rows": [ { one key per field } ]}.`
      : "Reply with a clear written report in plain text.",
  ]
    .filter(Boolean)
    .join("\n\n");
  try {
    const reply = await complete(SYSTEM, prompt);
    let output = reply.trim();
    if (workflow.outputFormat === "table") {
      const parsed = readJson<{ rows?: Record<string, unknown>[] }>(reply);
      if (!parsed?.rows) throw new Error("The model didn't return a table");
      const rows = parsed.rows.map((r) => fields.map((f) => String(r[f] ?? "")));
      output = JSON.stringify({ fields, rows });
    }
    await db.update(workflowRuns).set({ status: "done", output, finishedAt: now() }).where(eq(workflowRuns.id, id));
  } catch (error) {
    const message = error instanceof Error ? error.message : "The run failed";
    await db.update(workflowRuns).set({ status: "failed", error: message, finishedAt: now() }).where(eq(workflowRuns.id, id));
  }
  return { id };
}

export async function listRuns(user: EveryAppUser, matterId: string) {
  const access = await requireMatter(user, matterId);
  const rows = await db
    .select()
    .from(workflowRuns)
    .where(eq(workflowRuns.matterId, matterId))
    .orderBy(desc(workflowRuns.createdAt));
  const emails = await emailsFor(rows.map((r) => r.authorId));
  return {
    canRun: access.canEdit,
    runs: rows.map((r) => ({
      id: r.id,
      workflowName: r.workflowName,
      status: r.status,
      author: emails.get(r.authorId) ?? "",
      createdAt: r.createdAt,
    })),
  };
}

export async function getRun(user: EveryAppUser, runId: string) {
  const [run] = await db.select().from(workflowRuns).where(eq(workflowRuns.id, runId));
  if (!run) throw new NotFoundError("Run not found");
  await requireMatter(user, run.matterId);
  const author = (await emailsFor([run.authorId])).get(run.authorId) ?? "";
  return {
    id: run.id,
    matterId: run.matterId,
    workflowName: run.workflowName,
    status: run.status,
    author,
    createdAt: run.createdAt,
    finishedAt: run.finishedAt,
    context: run.context,
    error: run.error,
    inputs: parseJson<{ slot: string; documentId: string; documentName: string }[]>(run.inputs, []),
    outputFormat: run.outputFormat,
    report: run.outputFormat === "report" ? run.output : "",
    table: run.outputFormat === "table" ? parseJson<{ fields: string[]; rows: string[][] }>(run.output, { fields: [], rows: [] }) : null,
  };
}
