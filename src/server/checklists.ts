import { and, asc, desc, eq } from "drizzle-orm";
import type { EveryAppUser } from "@every-app/sdk/server";
import { z } from "zod";
import { db } from "@/db";
import { checklistActivity, checklistItems, checklists } from "@/db/schema";
import { complete, documentBlock, readJson } from "./ai";
import {
  emailsFor,
  ForbiddenError,
  matterPeople,
  newId,
  NotFoundError,
  parseJson,
  requireMatter,
} from "./core";
import { matterDocuments } from "./documents";

const status = z.enum(["open", "in_progress", "blocked", "done"]);
export type ItemStatus = z.infer<typeof status>;

export const createChecklistInput = z.object({
  matterId: z.string().min(1),
  name: z.string().trim().min(1, "Name is required").max(200),
  generateFrom: z.array(z.string()).max(100).optional(),
});
export const addItemInput = z.object({
  checklistId: z.string().min(1),
  title: z.string().trim().min(1, "Title is required").max(300),
});
export const updateItemInput = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(1).max(300).optional(),
  description: z.string().trim().max(4000).optional(),
  status: status.optional(),
  ownerId: z.string().nullable().optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  sourceRef: z.string().trim().max(300).optional(),
  custom: z.object({ columnId: z.string(), value: z.string().max(2000) }).optional(),
});
export const moveItemInput = z.object({ id: z.string().min(1), direction: z.enum(["up", "down"]) });
export const addColumnInput = z.object({
  checklistId: z.string().min(1),
  name: z.string().trim().min(1, "Name is required").max(80),
});

type Column = { id: string; name: string };

async function listFor(user: EveryAppUser, id: string, need: "read" | "edit" = "read") {
  const [list] = await db.select().from(checklists).where(eq(checklists.id, id));
  if (!list) throw new NotFoundError("Checklist not found");
  const access = await requireMatter(user, list.matterId, need);
  return { list, access };
}

async function itemFor(user: EveryAppUser, id: string) {
  const [item] = await db.select().from(checklistItems).where(eq(checklistItems.id, id));
  if (!item) throw new NotFoundError("Item not found");
  const { list } = await listFor(user, item.checklistId, "edit");
  return { item, list };
}

function logRow(
  list: string,
  actorId: string,
  action: string,
  item?: { id: string; title: string },
  change?: { field: string; oldValue: string | null; newValue: string | null },
) {
  return db.insert(checklistActivity).values({
    id: newId(),
    checklistId: list,
    itemId: item?.id ?? null,
    itemTitle: item?.title ?? "",
    actorId,
    action,
    field: change?.field ?? null,
    oldValue: change?.oldValue ?? null,
    newValue: change?.newValue ?? null,
  });
}

export async function listChecklists(user: EveryAppUser, matterId: string) {
  const access = await requireMatter(user, matterId);
  const rows = await db
    .select()
    .from(checklists)
    .where(eq(checklists.matterId, matterId))
    .orderBy(desc(checklists.createdAt));
  const counts = await Promise.all(
    rows.map((r) => db.select({ status: checklistItems.status }).from(checklistItems).where(eq(checklistItems.checklistId, r.id))),
  );
  return {
    canEdit: access.canEdit,
    checklists: rows.map((r, i) => ({
      id: r.id,
      name: r.name,
      total: counts[i]!.length,
      done: counts[i]!.filter((c) => c.status === "done").length,
    })),
  };
}

const SYSTEM = `TASK:checklist
You draft a legal checklist from the documents provided: obligations, conditions, deadlines and actions.
Reply with JSON only: {"items": [{"title": short action, "description": one sentence, "document": exact document name, "clause": clause or section reference}]}.`;

export async function createChecklist(user: EveryAppUser, input: z.infer<typeof createChecklistInput>) {
  await requireMatter(user, input.matterId, "edit");
  let drafted: { title: string; description: string; sourceDocumentId: string | null; sourceRef: string }[] = [];
  if (input.generateFrom) {
    const docs = await matterDocuments(input.matterId, input.generateFrom);
    if (!docs.length) throw new ForbiddenError("Upload a document first");
    const reply = await complete(SYSTEM, documentBlock(docs));
    const parsed = readJson<{ items?: { title?: string; description?: string; document?: string; clause?: string }[] }>(reply);
    drafted = (parsed?.items ?? [])
      .filter((i) => i.title)
      .slice(0, 100)
      .map((i) => ({
        title: String(i.title).slice(0, 300),
        description: String(i.description ?? "").slice(0, 4000),
        sourceDocumentId: docs.find((d) => d.name === i.document)?.id ?? null,
        sourceRef: String(i.clause ?? "").slice(0, 300),
      }));
  }
  const id = newId();
  const items = drafted.map((d, position) => ({ id: newId(), checklistId: id, position, ...d }));
  await db.batch([
    db.insert(checklists).values({ id, matterId: input.matterId, name: input.name, createdBy: user.id }),
    logRow(id, user.id, input.generateFrom ? `created the list with ${items.length} drafted items` : "created the list"),
    ...items.map((item) => db.insert(checklistItems).values(item)),
    ...items.map((item) => logRow(id, user.id, "created", item)),
  ]);
  return { id };
}

export async function getChecklist(user: EveryAppUser, id: string) {
  const { list, access } = await listFor(user, id);
  const [items, activity, people, docs] = await Promise.all([
    db.select().from(checklistItems).where(eq(checklistItems.checklistId, id)).orderBy(asc(checklistItems.position)),
    db.select().from(checklistActivity).where(eq(checklistActivity.checklistId, id)).orderBy(desc(checklistActivity.createdAt)),
    matterPeople(list.matterId, access.matter.ownerId),
    matterDocuments(list.matterId),
  ]);
  const emails = await emailsFor(activity.map((a) => a.actorId));
  const docName = new Map(docs.map((d) => [d.id, d.name]));
  return {
    id: list.id,
    matterId: list.matterId,
    name: list.name,
    canEdit: access.canEdit,
    columns: parseJson<Column[]>(list.columns, []),
    people,
    items: items.map((i) => ({
      id: i.id,
      title: i.title,
      description: i.description,
      status: i.status,
      ownerId: i.ownerId,
      dueDate: i.dueDate,
      sourceDocumentId: i.sourceDocumentId && docName.has(i.sourceDocumentId) ? i.sourceDocumentId : null,
      sourceDocumentName: i.sourceDocumentId ? (docName.get(i.sourceDocumentId) ?? null) : null,
      sourceRef: i.sourceRef,
      custom: parseJson<Record<string, string>>(i.custom, {}),
    })),
    activity: activity.map((a) => ({
      id: a.id,
      itemId: a.itemId,
      itemTitle: a.itemTitle,
      actor: emails.get(a.actorId) ?? "",
      action: a.action,
      field: a.field,
      oldValue: a.oldValue,
      newValue: a.newValue,
      createdAt: a.createdAt,
    })),
  };
}

export async function addItem(user: EveryAppUser, input: z.infer<typeof addItemInput>) {
  const { list } = await listFor(user, input.checklistId, "edit");
  const existing = await db
    .select({ position: checklistItems.position })
    .from(checklistItems)
    .where(eq(checklistItems.checklistId, list.id))
    .orderBy(desc(checklistItems.position))
    .limit(1);
  const item = { id: newId(), checklistId: list.id, title: input.title, position: (existing[0]?.position ?? -1) + 1 };
  await db.batch([db.insert(checklistItems).values(item), logRow(list.id, user.id, "created", item)]);
}

export async function updateItem(user: EveryAppUser, input: z.infer<typeof updateItemInput>) {
  const { item, list } = await itemFor(user, input.id);
  const people = await matterPeople(list.matterId, (await requireMatter(user, list.matterId)).matter.ownerId);
  const emailOf = (id: string | null) => (id ? (people.find((p) => p.id === id)?.email ?? id) : null);
  if (input.ownerId && !people.some((p) => p.id === input.ownerId))
    throw new ForbiddenError("The owner must be a member of the matter");
  const set: Partial<typeof checklistItems.$inferInsert> = {};
  const changes: { field: string; oldValue: string | null; newValue: string | null }[] = [];
  const track = <K extends "title" | "description" | "status" | "dueDate" | "sourceRef">(field: K, value: string | null | undefined) => {
    if (value === undefined || value === item[field]) return;
    (set as Record<string, unknown>)[field] = value;
    changes.push({ field, oldValue: item[field] ?? null, newValue: value });
  };
  track("title", input.title);
  track("description", input.description);
  track("status", input.status);
  track("dueDate", input.dueDate);
  track("sourceRef", input.sourceRef);
  if (input.ownerId !== undefined && input.ownerId !== item.ownerId) {
    set.ownerId = input.ownerId;
    changes.push({ field: "owner", oldValue: emailOf(item.ownerId), newValue: emailOf(input.ownerId) });
  }
  if (input.custom) {
    const columns = parseJson<Column[]>(list.columns, []);
    const column = columns.find((c) => c.id === input.custom!.columnId);
    if (!column) throw new NotFoundError("Column not found");
    const custom = parseJson<Record<string, string>>(item.custom, {});
    if ((custom[column.id] ?? "") !== input.custom.value) {
      changes.push({ field: column.name, oldValue: custom[column.id] ?? null, newValue: input.custom.value });
      custom[column.id] = input.custom.value;
      set.custom = JSON.stringify(custom);
    }
  }
  if (!changes.length) return;
  const title = set.title ?? item.title;
  await db.batch([
    db.update(checklistItems).set(set).where(eq(checklistItems.id, item.id)),
    ...changes.map((c) => logRow(list.id, user.id, c.field === "status" ? "changed status" : "edited", { id: item.id, title }, c)),
  ]);
}

export async function moveItem(user: EveryAppUser, input: z.infer<typeof moveItemInput>) {
  const { item, list } = await itemFor(user, input.id);
  const items = await db
    .select({ id: checklistItems.id, position: checklistItems.position })
    .from(checklistItems)
    .where(eq(checklistItems.checklistId, list.id))
    .orderBy(asc(checklistItems.position));
  const index = items.findIndex((i) => i.id === item.id);
  const other = items[input.direction === "up" ? index - 1 : index + 1];
  if (!other) return;
  await db.batch([
    db.update(checklistItems).set({ position: other.position }).where(eq(checklistItems.id, item.id)),
    db.update(checklistItems).set({ position: item.position }).where(eq(checklistItems.id, other.id)),
    logRow(list.id, user.id, `moved ${input.direction}`, item),
  ]);
}

export async function deleteItem(user: EveryAppUser, id: string) {
  const { item, list } = await itemFor(user, id);
  await db.batch([
    db.delete(checklistItems).where(and(eq(checklistItems.id, item.id))),
    logRow(list.id, user.id, "deleted", item),
  ]);
}

export async function addColumn(user: EveryAppUser, input: z.infer<typeof addColumnInput>) {
  const { list } = await listFor(user, input.checklistId, "edit");
  const columns = parseJson<Column[]>(list.columns, []);
  if (columns.length >= 10) throw new ForbiddenError("A list can have up to 10 columns");
  columns.push({ id: newId(), name: input.name });
  await db.batch([
    db.update(checklists).set({ columns: JSON.stringify(columns) }).where(eq(checklists.id, list.id)),
    logRow(list.id, user.id, `added the column "${input.name}"`),
  ]);
}

export async function deleteChecklist(user: EveryAppUser, id: string) {
  const { list } = await listFor(user, id, "edit");
  await db.batch([
    db.delete(checklistActivity).where(eq(checklistActivity.checklistId, id)),
    db.delete(checklistItems).where(eq(checklistItems.checklistId, id)),
    db.delete(checklists).where(eq(checklists.id, id)),
  ]);
  return { matterId: list.matterId };
}
