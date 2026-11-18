import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { EveryAppUser } from "@every-app/sdk/server";
import { z } from "zod";
import { db } from "@/db";
import {
  documents,
  reviewCells,
  reviewColumns,
  reviewDocuments,
  reviews,
  reviewTemplates,
} from "@/db/schema";
import { AiOffError, complete, documentBlock, readJson } from "./ai";
import {
  emailsFor,
  ForbiddenError,
  newId,
  NotFoundError,
  now,
  parseJson,
  requireMatter,
} from "./core";

const format = z.enum(["text", "yes_no", "date", "number", "choice"]);
const columnFields = {
  label: z.string().trim().min(1, "Label is required").max(120),
  prompt: z.string().trim().min(1, "Prompt is required").max(2000),
  format,
  choices: z.array(z.string().trim().min(1).max(100)).max(30).default([]),
};
export const columnInput = z.object(columnFields).refine(
  (c) => c.format !== "choice" || c.choices.length >= 2,
  "Give at least two choices",
);
export const createReviewInput = z.object({
  matterId: z.string().min(1),
  name: z.string().trim().min(1, "Name is required").max(200),
  documentIds: z.array(z.string()).max(500),
  templateId: z.string().optional(),
});
export const addColumnInput = z.object({ reviewId: z.string().min(1), column: columnInput });
export const runInput = z.object({
  reviewId: z.string().min(1),
  columnId: z.string().optional(),
  documentId: z.string().optional(),
});
export const cellKey = z.object({ columnId: z.string().min(1), documentId: z.string().min(1) });
export const editCellInput = cellKey.extend({ answer: z.string().max(4000) });
export const flagCellInput = cellKey.extend({ on: z.boolean() });
export const saveTemplateInput = z.object({
  reviewId: z.string().min(1),
  name: z.string().trim().min(1, "Name is required").max(120),
});

export type ColumnFormat = z.infer<typeof format>;

export async function listReviews(user: EveryAppUser, matterId: string) {
  const access = await requireMatter(user, matterId);
  const rows = await db
    .select()
    .from(reviews)
    .where(eq(reviews.matterId, matterId))
    .orderBy(desc(reviews.createdAt));
  const emails = await emailsFor(rows.map((r) => r.createdBy));
  const templates = await db
    .select({ id: reviewTemplates.id, name: reviewTemplates.name })
    .from(reviewTemplates)
    .where(eq(reviewTemplates.orgId, user.orgId))
    .orderBy(reviewTemplates.name);
  return {
    canEdit: access.canEdit,
    templates,
    reviews: rows.map((r) => ({
      id: r.id,
      name: r.name,
      createdBy: emails.get(r.createdBy) ?? "",
      createdAt: r.createdAt,
    })),
  };
}

export async function createReview(user: EveryAppUser, input: z.infer<typeof createReviewInput>) {
  await requireMatter(user, input.matterId, "edit");
  const docs = await db
    .select({ id: documents.id })
    .from(documents)
    .where(
      input.documentIds.length
        ? and(eq(documents.matterId, input.matterId), inArray(documents.id, input.documentIds))
        : eq(documents.matterId, input.matterId),
    )
    .orderBy(documents.createdAt);
  let columns: z.infer<typeof columnInput>[] = [];
  if (input.templateId) {
    const [template] = await db
      .select()
      .from(reviewTemplates)
      .where(and(eq(reviewTemplates.id, input.templateId), eq(reviewTemplates.orgId, user.orgId)));
    if (!template) throw new NotFoundError("Template not found");
    columns = parseJson(template.columns, []);
  }
  const id = newId();
  await db.batch([
    db.insert(reviews).values({ id, matterId: input.matterId, name: input.name, createdBy: user.id }),
    ...docs.map((d, position) => db.insert(reviewDocuments).values({ reviewId: id, documentId: d.id, position })),
    ...columns.map((c, position) =>
      db.insert(reviewColumns).values({
        id: newId(),
        reviewId: id,
        label: c.label,
        prompt: c.prompt,
        format: c.format,
        choices: JSON.stringify(c.choices ?? []),
        position,
      }),
    ),
  ]);
  return { id };
}

async function reviewFor(user: EveryAppUser, reviewId: string, need: "read" | "edit" = "read") {
  const [review] = await db.select().from(reviews).where(eq(reviews.id, reviewId));
  if (!review) throw new NotFoundError("Review not found");
  const access = await requireMatter(user, review.matterId, need);
  return { review, access };
}

export async function getReview(user: EveryAppUser, reviewId: string) {
  const { review, access } = await reviewFor(user, reviewId);
  const [docs, columns, cells] = await Promise.all([
    db
      .select({ id: documents.id, name: documents.name })
      .from(reviewDocuments)
      .innerJoin(documents, eq(documents.id, reviewDocuments.documentId))
      .where(eq(reviewDocuments.reviewId, reviewId))
      .orderBy(asc(reviewDocuments.position)),
    db.select().from(reviewColumns).where(eq(reviewColumns.reviewId, reviewId)).orderBy(asc(reviewColumns.position)),
    db.select().from(reviewCells).where(eq(reviewCells.reviewId, reviewId)),
  ]);
  const emails = await emailsFor(cells.flatMap((c) => [c.reviewedBy, c.editedBy]));
  return {
    id: review.id,
    matterId: review.matterId,
    name: review.name,
    canEdit: access.canEdit,
    documents: docs,
    columns: columns.map((c) => ({ ...c, choices: parseJson<string[]>(c.choices, []) })),
    cells: cells.map((c) => ({
      columnId: c.columnId,
      documentId: c.documentId,
      answer: c.answer,
      reasoning: c.reasoning,
      quote: c.quote,
      status: c.status,
      edited: !!c.editedBy,
      editedBy: c.editedBy ? (emails.get(c.editedBy) ?? "") : null,
      reviewedBy: c.reviewedBy ? (emails.get(c.reviewedBy) ?? "") : null,
      reviewedAt: c.reviewedAt,
      locked: c.locked,
    })),
  };
}

export async function addColumn(user: EveryAppUser, input: z.infer<typeof addColumnInput>) {
  await reviewFor(user, input.reviewId, "edit");
  const existing = await db
    .select({ id: reviewColumns.id })
    .from(reviewColumns)
    .where(eq(reviewColumns.reviewId, input.reviewId));
  const c = input.column;
  await db.insert(reviewColumns).values({
    id: newId(),
    reviewId: input.reviewId,
    label: c.label,
    prompt: c.prompt,
    format: c.format,
    choices: JSON.stringify(c.format === "choice" ? c.choices : []),
    position: existing.length,
  });
}

export async function deleteColumn(user: EveryAppUser, columnId: string) {
  const [column] = await db.select().from(reviewColumns).where(eq(reviewColumns.id, columnId));
  if (!column) throw new NotFoundError("Column not found");
  await reviewFor(user, column.reviewId, "edit");
  await db.batch([
    db.delete(reviewCells).where(eq(reviewCells.columnId, columnId)),
    db.delete(reviewColumns).where(eq(reviewColumns.id, columnId)),
  ]);
}

const FORMAT_RULES: Record<ColumnFormat, string> = {
  text: "a short plain-text answer",
  yes_no: 'exactly "Yes" or "No"',
  date: 'a date written like "31 December 2029", or "Not stated"',
  number: "a number only, digits without units, or \"Not stated\"",
  choice: "exactly one of the choices",
};

const SYSTEM = `TASK:cell
You review one legal document and answer one question about it.
Reply with JSON only: {"answer": string, "reasoning": one or two sentences, "quote": the passage the answer rests on, copied word for word}.`;

/** Asks the model for each cell of a column, a row, or the whole grid. Locked cells are skipped. */
export async function runCells(user: EveryAppUser, input: z.infer<typeof runInput>) {
  const { review } = await reviewFor(user, input.reviewId, "edit");
  const grid = await getReview(user, input.reviewId);
  const columns = grid.columns.filter((c) => !input.columnId || c.id === input.columnId);
  const docIds = grid.documents.filter((d) => !input.documentId || d.id === input.documentId).map((d) => d.id);
  if (!columns.length || !docIds.length) return { ran: 0 };
  const docs = await db
    .select({ id: documents.id, name: documents.name, text: documents.text })
    .from(documents)
    .where(and(eq(documents.matterId, review.matterId), inArray(documents.id, docIds)));
  const locked = new Set(grid.cells.filter((c) => c.locked).map((c) => `${c.columnId}:${c.documentId}`));
  const jobs = columns.flatMap((column) =>
    docs.filter((d) => !locked.has(`${column.id}:${d.id}`)).map((doc) => ({ column, doc })),
  );
  let ran = 0;
  let aiOff: AiOffError | null = null;
  const queue = [...jobs];
  async function worker() {
    for (let job = queue.shift(); job && !aiOff; job = queue.shift()) {
      const { column, doc } = job;
      const prompt = [
        documentBlock([doc]),
        `QUESTION: ${column.prompt}`,
        `FORMAT: ${column.format}`,
        column.format === "choice" ? `CHOICES: ${column.choices.join(" | ")}` : "",
        `The answer must be ${FORMAT_RULES[column.format]}.`,
      ]
        .filter(Boolean)
        .join("\n");
      let values: { answer: string; reasoning: string; quote: string; status: "done" | "error" };
      try {
        const reply = await complete(SYSTEM, prompt);
        const parsed = readJson<{ answer?: unknown; reasoning?: unknown; quote?: unknown }>(reply);
        values = {
          answer: String(parsed?.answer ?? reply).slice(0, 2000),
          reasoning: String(parsed?.reasoning ?? "").slice(0, 2000),
          quote: String(parsed?.quote ?? "").slice(0, 2000),
          status: parsed ? "done" : "error",
        };
      } catch (error) {
        if (error instanceof AiOffError) {
          aiOff = error;
          return;
        }
        values = { answer: "", reasoning: error instanceof Error ? error.message : "Failed", quote: "", status: "error" };
      }
      await db
        .insert(reviewCells)
        .values({ reviewId: review.id, columnId: column.id, documentId: doc.id, ...values, updatedAt: now() })
        .onConflictDoUpdate({
          target: [reviewCells.columnId, reviewCells.documentId],
          set: { ...values, editedBy: null, reviewedBy: null, reviewedAt: null, updatedAt: now() },
        });
      ran++;
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()]);
  if (aiOff) throw aiOff;
  return { ran };
}

async function cellFor(user: EveryAppUser, key: z.infer<typeof cellKey>) {
  const [column] = await db.select().from(reviewColumns).where(eq(reviewColumns.id, key.columnId));
  if (!column) throw new NotFoundError("Column not found");
  const { review } = await reviewFor(user, column.reviewId, "edit");
  const [member] = await db
    .select()
    .from(reviewDocuments)
    .where(and(eq(reviewDocuments.reviewId, review.id), eq(reviewDocuments.documentId, key.documentId)));
  if (!member) throw new NotFoundError("Document not in this review");
  const [cell] = await db
    .select()
    .from(reviewCells)
    .where(and(eq(reviewCells.columnId, key.columnId), eq(reviewCells.documentId, key.documentId)));
  return { review, cell };
}

export async function editCell(user: EveryAppUser, input: z.infer<typeof editCellInput>) {
  const { review, cell } = await cellFor(user, input);
  if (cell?.locked) throw new ForbiddenError("Unlock the cell to edit it");
  await db
    .insert(reviewCells)
    .values({ reviewId: review.id, columnId: input.columnId, documentId: input.documentId, answer: input.answer, status: "done", editedBy: user.id })
    .onConflictDoUpdate({
      target: [reviewCells.columnId, reviewCells.documentId],
      set: { answer: input.answer, status: "done", editedBy: user.id, updatedAt: now() },
    });
}

export async function markReviewed(user: EveryAppUser, input: z.infer<typeof flagCellInput>) {
  const { cell } = await cellFor(user, input);
  if (!cell) throw new NotFoundError("Run the cell first");
  await db
    .update(reviewCells)
    .set(input.on ? { reviewedBy: user.id, reviewedAt: now() } : { reviewedBy: null, reviewedAt: null })
    .where(and(eq(reviewCells.columnId, input.columnId), eq(reviewCells.documentId, input.documentId)));
}

export async function lockCell(user: EveryAppUser, input: z.infer<typeof flagCellInput>) {
  const { cell } = await cellFor(user, input);
  if (!cell) throw new NotFoundError("Run the cell first");
  await db
    .update(reviewCells)
    .set({ locked: input.on })
    .where(and(eq(reviewCells.columnId, input.columnId), eq(reviewCells.documentId, input.documentId)));
}

export async function saveTemplate(user: EveryAppUser, input: z.infer<typeof saveTemplateInput>) {
  await reviewFor(user, input.reviewId, "edit");
  const columns = await db
    .select()
    .from(reviewColumns)
    .where(eq(reviewColumns.reviewId, input.reviewId))
    .orderBy(asc(reviewColumns.position));
  if (!columns.length) throw new ForbiddenError("Add a column first");
  await db.insert(reviewTemplates).values({
    id: newId(),
    orgId: user.orgId,
    name: input.name,
    createdBy: user.id,
    columns: JSON.stringify(
      columns.map((c) => ({ label: c.label, prompt: c.prompt, format: c.format, choices: parseJson(c.choices, []) })),
    ),
  });
}

export async function deleteReview(user: EveryAppUser, reviewId: string) {
  const { review } = await reviewFor(user, reviewId, "edit");
  await db.batch([
    db.delete(reviewCells).where(eq(reviewCells.reviewId, reviewId)),
    db.delete(reviewColumns).where(eq(reviewColumns.reviewId, reviewId)),
    db.delete(reviewDocuments).where(eq(reviewDocuments.reviewId, reviewId)),
    db.delete(reviews).where(eq(reviews.id, reviewId)),
  ]);
  return { matterId: review.matterId };
}
