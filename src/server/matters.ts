import { env } from "cloudflare:workers";
import { and, desc, eq, inArray, or } from "drizzle-orm";
import { isAdmin, type EveryAppUser } from "@every-app/sdk/server";
import { z } from "zod";
import { db } from "@/db";
import {
  checklistActivity,
  checklistItems,
  checklists,
  documents,
  matterMembers,
  matters,
  messages,
  reviewCells,
  reviewColumns,
  reviewDocuments,
  reviews,
  threads,
  users,
  workflowRuns,
} from "@/db/schema";
import {
  emailsFor,
  ForbiddenError,
  matterPeople,
  newId,
  NotFoundError,
  orgUsers,
  requireMatter,
} from "./core";

export const createMatterInput = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  client: z.string().trim().max(200).default(""),
  description: z.string().trim().max(2000).default(""),
});
export const idInput = z.object({ id: z.string().min(1) });
export const shareInput = z.object({
  matterId: z.string().min(1),
  userId: z.string().min(1),
  role: z.enum(["editor", "viewer"]),
});
export const unshareInput = z.object({
  matterId: z.string().min(1),
  userId: z.string().min(1),
});

/** Matters the person owns or is shared on; every matter for admins. */
export async function listMatters(user: EveryAppUser) {
  const shared = db
    .select({ id: matterMembers.matterId })
    .from(matterMembers)
    .where(eq(matterMembers.userId, user.id));
  const rows = await db
    .select()
    .from(matters)
    .where(
      isAdmin(user)
        ? eq(matters.orgId, user.orgId)
        : and(
            eq(matters.orgId, user.orgId),
            or(eq(matters.ownerId, user.id), inArray(matters.id, shared)),
          ),
    )
    .orderBy(desc(matters.createdAt));
  const emails = await emailsFor(rows.map((r) => r.ownerId));
  return rows.map((m) => ({
    id: m.id,
    name: m.name,
    client: m.client,
    createdAt: m.createdAt,
    owner: emails.get(m.ownerId) ?? "",
    mine: m.ownerId === user.id,
  }));
}

export async function createMatter(
  user: EveryAppUser,
  input: z.infer<typeof createMatterInput>,
) {
  const id = newId();
  await db.insert(matters).values({ id, orgId: user.orgId, ownerId: user.id, ...input });
  return { id };
}

export async function getMatter(user: EveryAppUser, matterId: string) {
  const access = await requireMatter(user, matterId);
  const owner = (await emailsFor([access.matter.ownerId])).get(access.matter.ownerId);
  return {
    id: access.matter.id,
    name: access.matter.name,
    client: access.matter.client,
    description: access.matter.description,
    owner: owner ?? "",
    role: access.role,
    canEdit: access.canEdit,
    isOwner: access.isOwner,
  };
}

export async function getSharing(user: EveryAppUser, matterId: string) {
  const access = await requireMatter(user, matterId);
  const shares = await db
    .select({ userId: matterMembers.userId, role: matterMembers.role, email: users.email })
    .from(matterMembers)
    .leftJoin(users, eq(users.id, matterMembers.userId))
    .where(eq(matterMembers.matterId, matterId))
    .orderBy(users.email);
  const taken = new Set([access.matter.ownerId, ...shares.map((s) => s.userId)]);
  const candidates = access.isOwner
    ? (await orgUsers(user.orgId)).filter((u) => !taken.has(u.id))
    : [];
  const owner = (await emailsFor([access.matter.ownerId])).get(access.matter.ownerId);
  return {
    owner: owner ?? "",
    shares: shares.map((s) => ({ userId: s.userId, role: s.role, email: s.email ?? s.userId })),
    candidates,
  };
}

export async function share(user: EveryAppUser, input: z.infer<typeof shareInput>) {
  const access = await requireMatter(user, input.matterId, "owner");
  if (input.userId === access.matter.ownerId)
    throw new ForbiddenError("The owner already has full access");
  const [person] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, input.userId), eq(users.orgId, user.orgId)));
  if (!person) throw new NotFoundError("That person hasn't opened the app yet");
  await db
    .insert(matterMembers)
    .values({ matterId: input.matterId, userId: input.userId, role: input.role })
    .onConflictDoUpdate({
      target: [matterMembers.matterId, matterMembers.userId],
      set: { role: input.role },
    });
}

export async function unshare(user: EveryAppUser, input: z.infer<typeof unshareInput>) {
  await requireMatter(user, input.matterId, "owner");
  await db
    .delete(matterMembers)
    .where(and(eq(matterMembers.matterId, input.matterId), eq(matterMembers.userId, input.userId)));
}

/** Deletes a matter with its documents, chats, reviews, runs and lists. */
export async function deleteMatter(user: EveryAppUser, matterId: string) {
  await requireMatter(user, matterId, "owner");
  const docs = await db
    .select({ key: documents.storageKey })
    .from(documents)
    .where(eq(documents.matterId, matterId));
  const threadIds = db.select({ id: threads.id }).from(threads).where(eq(threads.matterId, matterId));
  const reviewIds = db.select({ id: reviews.id }).from(reviews).where(eq(reviews.matterId, matterId));
  const listIds = db.select({ id: checklists.id }).from(checklists).where(eq(checklists.matterId, matterId));
  await db.batch([
    db.delete(messages).where(inArray(messages.threadId, threadIds)),
    db.delete(threads).where(eq(threads.matterId, matterId)),
    db.delete(reviewCells).where(inArray(reviewCells.reviewId, reviewIds)),
    db.delete(reviewColumns).where(inArray(reviewColumns.reviewId, reviewIds)),
    db.delete(reviewDocuments).where(inArray(reviewDocuments.reviewId, reviewIds)),
    db.delete(reviews).where(eq(reviews.matterId, matterId)),
    db.delete(checklistActivity).where(inArray(checklistActivity.checklistId, listIds)),
    db.delete(checklistItems).where(inArray(checklistItems.checklistId, listIds)),
    db.delete(checklists).where(eq(checklists.matterId, matterId)),
    db.delete(workflowRuns).where(eq(workflowRuns.matterId, matterId)),
    db.delete(documents).where(eq(documents.matterId, matterId)),
    db.delete(matterMembers).where(eq(matterMembers.matterId, matterId)),
    db.delete(matters).where(eq(matters.id, matterId)),
  ]);
  if (docs.length) await env.files.delete(docs.map((d) => d.key));
}

export { matterPeople };
