import { env } from "cloudflare:workers";
import { and, desc, eq, inArray } from "drizzle-orm";
import type { EveryAppUser } from "@every-app/sdk/server";
import { z } from "zod";
import { db } from "@/db";
import { documents, reviewCells, reviewDocuments } from "@/db/schema";
import { emailsFor, newId, NotFoundError, requireMatter } from "./core";
import { contentTypeOf, extractText, kindOf, MAX_UPLOAD_BYTES } from "./extract";

export const renameDocumentInput = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1, "Name is required").max(255),
});

export class UploadError extends Error {}

export async function listDocuments(user: EveryAppUser, matterId: string) {
  await requireMatter(user, matterId);
  const rows = await db
    .select({
      id: documents.id,
      name: documents.name,
      kind: documents.kind,
      size: documents.size,
      uploaderId: documents.uploaderId,
      createdAt: documents.createdAt,
    })
    .from(documents)
    .where(eq(documents.matterId, matterId))
    .orderBy(desc(documents.createdAt));
  const emails = await emailsFor(rows.map((r) => r.uploaderId));
  return rows.map(({ uploaderId, ...r }) => ({ ...r, uploader: emails.get(uploaderId) ?? "" }));
}

/** A document the person may see, with its matter access. */
export async function documentFor(
  user: EveryAppUser,
  documentId: string,
  need: "read" | "edit" = "read",
) {
  const [doc] = await db.select().from(documents).where(eq(documents.id, documentId));
  if (!doc) throw new NotFoundError("Document not found");
  const access = await requireMatter(user, doc.matterId, need);
  return { doc, access };
}

/** Documents of one matter by id, with their text; unknown ids are dropped. */
export async function matterDocuments(matterId: string, ids?: string[]) {
  const where = ids?.length
    ? and(eq(documents.matterId, matterId), inArray(documents.id, ids))
    : eq(documents.matterId, matterId);
  return db
    .select({ id: documents.id, name: documents.name, text: documents.text })
    .from(documents)
    .where(where)
    .orderBy(documents.createdAt);
}

export async function uploadDocument(user: EveryAppUser, matterId: string, file: File) {
  await requireMatter(user, matterId, "edit");
  const kind = kindOf(file.name, file.type);
  if (!kind) throw new UploadError("Upload a PDF, DOCX or TXT file.");
  if (file.size > MAX_UPLOAD_BYTES) throw new UploadError("Files can be up to 20 MB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  let text = "";
  try {
    text = await extractText(kind, bytes);
  } catch {
    throw new UploadError(`Couldn't read the text in ${file.name}.`);
  }
  const id = newId();
  const storageKey = `matters/${matterId}/${id}`;
  await env.files.put(storageKey, bytes, { httpMetadata: { contentType: contentTypeOf(kind) } });
  await db.insert(documents).values({
    id,
    matterId,
    name: file.name.slice(0, 255),
    kind,
    contentType: contentTypeOf(kind),
    size: file.size,
    storageKey,
    text,
    uploaderId: user.id,
  });
  return { id };
}

export async function renameDocument(user: EveryAppUser, input: z.infer<typeof renameDocumentInput>) {
  await documentFor(user, input.id, "edit");
  await db.update(documents).set({ name: input.name }).where(eq(documents.id, input.id));
}

export async function deleteDocument(user: EveryAppUser, id: string) {
  const { doc } = await documentFor(user, id, "edit");
  await db.batch([
    db.delete(reviewCells).where(eq(reviewCells.documentId, id)),
    db.delete(reviewDocuments).where(eq(reviewDocuments.documentId, id)),
    db.delete(documents).where(eq(documents.id, id)),
  ]);
  await env.files.delete(doc.storageKey);
}

/** The stored file, for opening or downloading. */
export async function documentFile(user: EveryAppUser, id: string, download: boolean) {
  const { doc } = await documentFor(user, id);
  const object = await env.files.get(doc.storageKey);
  if (!object) throw new NotFoundError("Document not found");
  const disposition = download ? "attachment" : "inline";
  return new Response(object.body, {
    headers: {
      "content-type": doc.contentType,
      "content-length": String(doc.size),
      "content-disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(doc.name)}`,
      "x-content-type-options": "nosniff",
      "cache-control": "private, no-store",
    },
  });
}
