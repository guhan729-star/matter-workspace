// Shared fixtures for the release checks: sample documents and a local
// stand-in for the Gateway's AI route that answers deterministically from
// the documents the app sends, so the AI paths can be exercised offline.
import { expect } from "/home/user/oss-new/control/runtime/index.mjs";

export const LEASE = `Commercial Lease Agreement between Harbor Point Properties LLC and Northwind Logistics Inc.
1.1 The Premises are Unit 4, 220 Dockside Avenue, Portland.
2.1 The term begins on 1 January 2025 and ends on 31 December 2029.
3.1 The Tenant shall pay annual rent of 186000 dollars in monthly instalments.
4.2 The Tenant shall not assign this lease without the prior written consent of the Landlord.
7.3 Either party may terminate on 90 days written notice after a material breach.
9.1 This lease is governed by the laws of the State of Oregon.`;

export const SIDE_LETTER = `Side Letter to the Commercial Lease dated 1 January 2025.
1.1 The Landlord grants a rent-free period of 3 months starting on 1 January 2025.
2.4 The Tenant may assign the lease to an affiliate with prior written notice to the Landlord.
5.1 The Landlord shall complete roof repairs by 30 June 2025.`;

const FAKE_AI = String.raw`
const sentences = (text) => text.split(/\n+/).map((s) => s.trim()).filter(Boolean);
const words = (s) => (s.toLowerCase().match(/[a-z]{4,}/g) || []);
function best(text, prompt) {
  const want = new Set(words(prompt));
  let top = sentences(text)[0] || "", score = -1;
  for (const s of sentences(text)) {
    const n = words(s).filter((w) => want.has(w)).length;
    if (n > score) { score = n; top = s; }
  }
  return { sentence: top, score };
}
function docs(content) {
  const out = [];
  const re = /<document name="([^"]*)">\n?([\s\S]*?)<\/document>/g;
  let m;
  while ((m = re.exec(content))) out.push({ name: m[1], text: m[2] });
  return out;
}
function after(content, label) {
  const m = content.match(new RegExp(label + ":\\s*(.*)"));
  return m ? m[1].trim() : "";
}
function answer(system, user) {
  const task = (system.match(/TASK:(\w+)/) || [])[1];
  const ds = docs(user);
  if (task === "ping") return "ok";
  if (task === "chat") {
    const q = after(user, "QUESTION");
    const hits = ds.map((d) => ({ d, b: best(d.text, q) })).sort((a, b) => b.b.score - a.b.score);
    const top = hits[0];
    return JSON.stringify({ answer: "According to " + top.d.name + ", " + top.b.sentence.replace(/^[\d.]+\s*/, ""), citations: [{ document: top.d.name, quote: top.b.sentence }] });
  }
  if (task === "cell") {
    const prompt = after(user, "QUESTION"), format = after(user, "FORMAT"), choices = after(user, "CHOICES");
    const d = ds[0], b = best(d.text, prompt), s = b.sentence;
    let value = s.replace(/^[\d.]+\s*/, "");
    if (format === "date") value = (s.match(/\d{1,2} \w+ \d{4}/g) || ["Not stated"]).pop();
    if (format === "number") value = (s.replace(/^[\d.]+\s*/, "").match(/\d+/) || ["0"])[0];
    if (format === "yes_no") value = /\bnot\b|without/.test(s) ? "No" : "Yes";
    if (format === "choice") { const list = choices.split("|").map((c) => c.trim()); value = list.find((c) => s.toLowerCase().includes(c.toLowerCase())) || list[0]; }
    return JSON.stringify({ answer: value, reasoning: "Clause " + (s.match(/^[\d.]+/) || ["?"])[0] + " of " + d.name + " addresses this.", quote: s });
  }
  if (task === "checklist") {
    const items = [];
    for (const d of ds) for (const s of sentences(d.text)) {
      const m = s.match(/^(\d+\.\d+)\s+(.*)$/);
      if (m && /shall|may/.test(m[2])) items.push({ title: m[2].split(" ").slice(0, 7).join(" "), description: m[2], document: d.name, clause: "Clause " + m[1] });
    }
    return JSON.stringify({ items });
  }
  if (task === "workflow") {
    const fields = after(user, "FIELDS");
    if (fields) {
      const names = fields.split("|").map((f) => f.trim());
      return JSON.stringify({ rows: ds.map((d) => Object.fromEntries(names.map((n) => [n, best(d.text, n).sentence.replace(/^[\d.]+\s*/, "")]))) });
    }
    return "Summary of " + ds.map((d) => d.name).join(", ") + ".\n\n" + ds.map((d) => sentences(d.text).slice(1, 3).join(" ")).join("\n\n");
  }
  return "";
}
export default { async fetch(request) {
  const url = new URL(request.url);
  if (request.method === "POST" && url.pathname.endsWith("/chat/completions")) {
    const body = await request.json();
    const system = body.messages.filter((m) => m.role === "system").map((m) => m.content).join("\n");
    const user = body.messages.filter((m) => m.role === "user").map((m) => m.content).join("\n");
    return Response.json({ id: "x", object: "chat.completion", model: "local", choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: answer(system, user) } }] });
  }
  const code = "integration_not_configured";
  return Response.json({ error: "Service Unavailable", code, message: "Not configured here." }, { status: 503, headers: { "x-everyapp-error": code } });
} };`;

/** startRuntime options that put the deterministic AI stand-in in place of the Gateway. */
export const withFakeAi = {
  bindings: { EVERY_APP_GATEWAY: { type: "worker", worker: "local-ai" } },
  workers: [{ config: { name: "local-ai", compatibilityDate: "2025-09-01", manifest: { mainModule: "ai.mjs", modules: { "ai.mjs": { type: "esm", contents: FAKE_AI } } } } }],
};

export function txt(name, text) {
  return { name, mimeType: "text/plain", buffer: Buffer.from(text) };
}

/** Creates a matter from the matters page and returns its id. */
export async function createMatter(page, { name, client, description }) {
  await page.goto("/");
  await page.getByTestId("new-matter").click();
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Client or reference").fill(client);
  if (description) await page.getByLabel("Description").fill(description);
  await Promise.all([page.waitForURL(/\/matters\/[^/]+$/), page.getByTestId("create-matter-submit").click()]);
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
  return new URL(page.url()).pathname.split("/")[2];
}

/** Uploads files on a matter's documents page and waits for their rows. */
export async function upload(page, files) {
  await page.getByTestId("upload-input").setInputFiles(files);
  for (const file of files) {
    await expect(page.getByTestId("document-row").filter({ hasText: file.name })).toBeVisible();
  }
}

/** Records the next server-function request the page sends while `action` runs. */
export async function captureServerFn(page, action) {
  const [request] = await Promise.all([
    page.waitForRequest((r) => r.url().includes("/_serverFn/") && r.method() === "POST"),
    action(),
  ]);
  return { path: new URL(request.url()).pathname + new URL(request.url()).search, headers: request.headers(), body: request.postData() };
}

/** Sends a recorded server-function request again as another role. */
export function replay(runtime, captured, role) {
  const headers = {};
  for (const [k, v] of Object.entries(captured.headers)) if (k === "content-type" || k.startsWith("x-tsr")) headers[k] = v;
  return runtime.fetch(captured.path, { role, method: "POST", headers, body: captured.body });
}
