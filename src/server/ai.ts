import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import {
  aiBaseUrl,
  createGatewayFetch,
  gatewayRefusal,
} from "@every-app/sdk/server";
import { db } from "@/db";
import { appState } from "@/db/schema";

/** Thrown when no model is set up on the Gateway. */
export class AiOffError extends Error {
  constructor(message = AI_OFF_MESSAGE) {
    super(message);
    this.name = "AiOffError";
  }
}

export const AI_OFF_MESSAGE =
  "No AI model is set up. An admin can add one in the Gateway.";

const STATUS_TTL_MS = 5 * 60 * 1000;
/** Characters of document text sent with one request. */
export const TEXT_BUDGET = 60_000;

async function remember(on: boolean, message: string | null) {
  const value = JSON.stringify({ on, message });
  await db
    .insert(appState)
    .values({ key: "ai", value, updatedAt: Date.now() })
    .onConflictDoUpdate({
      target: appState.key,
      set: { value, updatedAt: Date.now() },
    });
}

/** One chat completion through the Gateway's default model. */
export async function complete(
  system: string,
  user: string,
  options: { maxTokens?: number } = {},
): Promise<string> {
  const gatewayFetch = createGatewayFetch({ env, optional: true });
  if (!gatewayFetch) {
    await remember(false, null);
    throw new AiOffError();
  }
  const response = await gatewayFetch(`${aiBaseUrl()}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: "default",
      temperature: 0,
      ...(options.maxTokens ? { max_tokens: options.maxTokens } : {}),
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!response.ok) {
    const refusal = await gatewayRefusal(response);
    if (refusal && isOff(refusal.code)) {
      await remember(false, refusal.setup);
      throw new AiOffError(refusal.setup ?? AI_OFF_MESSAGE);
    }
    throw new Error(
      refusal?.message ?? `The AI model failed (${response.status})`,
    );
  }
  const body = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  await remember(true, null);
  return body.choices?.[0]?.message?.content ?? "";
}

function isOff(code: string) {
  return (
    code.endsWith("_not_configured") ||
    code === "provider_not_allowed" ||
    code === "capability_not_requested"
  );
}

/** Whether a model answers, remembered for a few minutes. */
export async function aiStatus(): Promise<{ on: boolean; message: string }> {
  const [row] = await db.select().from(appState).where(eq(appState.key, "ai"));
  if (row && Date.now() - row.updatedAt < STATUS_TTL_MS) {
    const saved = JSON.parse(row.value) as { on: boolean; message: string | null };
    return { on: saved.on, message: saved.message ?? AI_OFF_MESSAGE };
  }
  try {
    await complete("TASK:ping Reply with ok.", "ping", { maxTokens: 1 });
    return { on: true, message: "" };
  } catch (error) {
    if (error instanceof AiOffError) return { on: false, message: error.message };
    return { on: true, message: "" };
  }
}

/** Reads the first JSON object in a model's reply. */
export function readJson<T>(reply: string): T | null {
  const start = reply.indexOf("{");
  const end = reply.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(reply.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}

/** Documents as the model reads them, trimmed to the shared budget. */
export function documentBlock(docs: { name: string; text: string }[]): string {
  const share = Math.floor(TEXT_BUDGET / Math.max(docs.length, 1));
  return docs
    .map(
      (doc) =>
        `<document name="${doc.name.replaceAll('"', "'")}">\n${doc.text.slice(0, share)}\n</document>`,
    )
    .join("\n\n");
}

/** Whether a quote appears in the text, ignoring spacing and case. */
export function quoteFound(text: string, quote: string): boolean {
  const squash = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  const q = squash(quote);
  return q.length > 0 && squash(text).includes(q);
}
