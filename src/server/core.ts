import { and, eq, inArray } from "drizzle-orm";
import { isAdmin, type EveryAppUser } from "@every-app/sdk/server";
import { db } from "@/db";
import { matterMembers, matters, users } from "@/db/schema";

export type Role = "owner" | "editor" | "viewer";

export class NotFoundError extends Error {
  constructor(what = "Not found") {
    super(what);
    this.name = "NotFoundError";
  }
}
export class ForbiddenError extends Error {
  constructor(what = "You can't change this") {
    super(what);
    this.name = "ForbiddenError";
  }
}

export const newId = () => crypto.randomUUID();
export const now = () => new Date().toISOString();

export function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

/** Records the person on first sight and keeps their email current. */
export async function rememberUser(user: EveryAppUser): Promise<void> {
  await db
    .insert(users)
    .values({ id: user.id, orgId: user.orgId, email: user.email ?? user.id })
    .onConflictDoUpdate({
      target: users.id,
      set: { email: user.email ?? user.id, orgId: user.orgId },
    });
}

export async function orgUsers(orgId: string) {
  return db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.orgId, orgId))
    .orderBy(users.email);
}

export async function emailsFor(ids: (string | null | undefined)[]) {
  const wanted = [...new Set(ids.filter((id): id is string => !!id))];
  if (wanted.length === 0) return new Map<string, string>();
  const rows = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(inArray(users.id, wanted));
  return new Map(rows.map((row) => [row.id, row.email]));
}

export interface MatterAccess {
  matter: typeof matters.$inferSelect;
  /** The person's role; admins with no share read as viewers. */
  role: Role;
  canEdit: boolean;
  isOwner: boolean;
}

/** What the person may do on a matter, or null when they may not see it. */
export async function matterAccess(
  user: EveryAppUser,
  matterId: string,
): Promise<MatterAccess | null> {
  const [matter] = await db
    .select()
    .from(matters)
    .where(and(eq(matters.id, matterId), eq(matters.orgId, user.orgId)));
  if (!matter) return null;
  let role: Role | null = null;
  if (matter.ownerId === user.id) role = "owner";
  else {
    const [share] = await db
      .select({ role: matterMembers.role })
      .from(matterMembers)
      .where(
        and(
          eq(matterMembers.matterId, matterId),
          eq(matterMembers.userId, user.id),
        ),
      );
    role = share?.role ?? (isAdmin(user) ? "viewer" : null);
  }
  if (!role) return null;
  return {
    matter,
    role,
    canEdit: role === "owner" || role === "editor",
    isOwner: role === "owner",
  };
}

/** Throws unless the person may see the matter, and edit or own it when asked. */
export async function requireMatter(
  user: EveryAppUser,
  matterId: string,
  need: "read" | "edit" | "owner" = "read",
): Promise<MatterAccess> {
  const access = await matterAccess(user, matterId);
  if (!access) throw new NotFoundError("Matter not found");
  if (need === "edit" && !access.canEdit)
    throw new ForbiddenError("Viewers can't change this matter");
  if (need === "owner" && !access.isOwner)
    throw new ForbiddenError("Only the matter's owner can do this");
  return access;
}

/** The people on a matter: its owner and everyone it is shared with. */
export async function matterPeople(matterId: string, ownerId: string) {
  const shares = await db
    .select({ userId: matterMembers.userId })
    .from(matterMembers)
    .where(eq(matterMembers.matterId, matterId));
  const ids = [ownerId, ...shares.map((s) => s.userId)];
  const emails = await emailsFor(ids);
  return ids.map((id) => ({ id, email: emails.get(id) ?? id }));
}
