import { and, asc, desc, eq } from "drizzle-orm";
import type { EveryAppUser } from "@every-app/sdk/server";
import { z } from "zod";
import { db } from "@/db";
import { messages, threads } from "@/db/schema";
import { complete, documentBlock, quoteFound, readJson } from "./ai";
import {
  emailsFor,
  ForbiddenError,
  newId,
  NotFoundError,
  parseJson,
  requireMatter,
} from "./core";
import { matterDocuments } from "./documents";

export const createThreadInput = z.object({ matterId: z.string().min(1) });
export const renameThreadInput = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(1, "Name is required").max(200),
});
export const askInput = z.object({
  threadId: z.string().min(1),
  question: z.string().trim().min(1, "Ask a question").max(4000),
  documentIds: z.array(z.string()).max(200),
});

export interface Citation {
  documentId: string;
  documentName: string;
  quote: string;
}

export async function listThreads(user: EveryAppUser, matterId: string) {
  const access = await requireMatter(user, matterId);
  const rows = await db
    .select()
    .from(threads)
    .where(eq(threads.matterId, matterId))
    .orderBy(desc(threads.createdAt));
  const emails = await emailsFor(rows.map((r) => r.authorId));
  return {
    canPost: access.canEdit,
    threads: rows.map((t) => ({
      id: t.id,
      title: t.title,
      author: emails.get(t.authorId) ?? "",
      createdAt: t.createdAt,
    })),
  };
}

export async function createThread(user: EveryAppUser, matterId: string) {
  await requireMatter(user, matterId, "edit");
  const id = newId();
  await db.insert(threads).values({ id, matterId, authorId: user.id, title: "New thread" });
  return { id };
}

async function threadFor(user: EveryAppUser, id: string, need: "read" | "edit" = "read") {
  const [thread] = await db.select().from(threads).where(eq(threads.id, id));
  if (!thread) throw new NotFoundError("Thread not found");
  const access = await requireMatter(user, thread.matterId, need);
  return { thread, access };
}

export async function getThread(user: EveryAppUser, id: string) {
  const { thread, access } = await threadFor(user, id);
  const rows = await db
    .select()
    .from(messages)
    .where(eq(messages.threadId, id))
    .orderBy(asc(messages.createdAt));
  const emails = await emailsFor([thread.authorId, ...rows.map((r) => r.authorId)]);
  return {
    id: thread.id,
    matterId: thread.matterId,
    title: thread.title,
    author: emails.get(thread.authorId) ?? "",
    isAuthor: thread.authorId === user.id,
    canPost: access.canEdit,
    documentIds: parseJson<string[]>(thread.documentIds, []),
    messages: rows.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      author: emails.get(m.authorId) ?? "",
      createdAt: m.createdAt,
      citations: parseJson<Citation[]>(m.citations, []),
    })),
  };
}

export async function renameThread(user: EveryAppUser, input: z.infer<typeof renameThreadInput>) {
  const { thread } = await threadFor(user, input.id);
  if (thread.authorId !== user.id) throw new ForbiddenError("Only the thread's author can rename it");
  await db.update(threads).set({ title: input.title }).where(eq(threads.id, input.id));
}

export async function deleteThread(user: EveryAppUser, id: string) {
  const { thread } = await threadFor(user, id);
  if (thread.authorId !== user.id) throw new ForbiddenError("Only the thread's author can delete it");
  await db.batch([
    db.delete(messages).where(eq(messages.threadId, id)),
    db.delete(threads).where(eq(threads.id, id)),
  ]);
  return { matterId: thread.matterId };
}

const SYSTEM = `TASK:chat
You answer a legal team's questions using only the documents provided.
Reply with JSON only: {"answer": string, "citations": [{"document": exact document name, "quote": short passage copied word for word from that document}]}.
If the documents don't answer the question, say so in "answer" and give no citations.`;

export async function ask(user: EveryAppUser, input: z.infer<typeof askInput>) {
  const { thread } = await threadFor(user, input.threadId, "edit");
  const docs = await matterDocuments(thread.matterId, input.documentIds);
  const history = await db
    .select({ role: messages.role, content: messages.content })
    .from(messages)
    .where(eq(messages.threadId, thread.id))
    .orderBy(asc(messages.createdAt));
  const earlier = history
    .slice(-6)
    .map((m) => `${m.role === "user" ? "Q" : "A"}: ${m.content}`)
    .join("\n");
  const prompt = `${documentBlock(docs)}\n\n${earlier ? `EARLIER:\n${earlier}\n\n` : ""}QUESTION: ${input.question}`;
  const reply = await complete(SYSTEM, prompt);
  const parsed = readJson<{ answer?: string; citations?: { document?: string; quote?: string }[] }>(reply);
  const answer = parsed?.answer?.trim() || reply.trim() || "No answer came back.";
  const citations: Citation[] = [];
  for (const c of parsed?.citations ?? []) {
    const doc = docs.find((d) => d.name === c.document);
    if (doc && c.quote && quoteFound(doc.text, c.quote))
      citations.push({ documentId: doc.id, documentName: doc.name, quote: c.quote.slice(0, 400) });
  }
  const title =
    history.length === 0 && thread.title === "New thread"
      ? input.question.slice(0, 80)
      : thread.title;
  const asked = new Date();
  const answered = new Date(asked.getTime() + 1);
  await db.batch([
    db.insert(messages).values({ id: newId(), threadId: thread.id, role: "user", authorId: user.id, content: input.question, createdAt: asked.toISOString() }),
    db.insert(messages).values({
      id: newId(),
      threadId: thread.id,
      role: "assistant",
      authorId: user.id,
      content: answer,
      citations: JSON.stringify(citations),
      createdAt: answered.toISOString(),
    }),
    db
      .update(threads)
      .set({ title, documentIds: JSON.stringify(input.documentIds) })
      .where(and(eq(threads.id, thread.id))),
  ]);
}
