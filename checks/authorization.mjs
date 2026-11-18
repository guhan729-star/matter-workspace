import { startRuntime, expect } from "/home/user/oss-new/control/runtime/index.mjs";
import { LEASE, withFakeAi, txt, createMatter, upload, captureServerFn, replay } from "./lib.mjs";

const runtime = await startRuntime(withFakeAi);
try {
  await runtime.assertPrivateAccess(["/", "/workflows", "/health"]);
  const db = await runtime.database();

  // The app has no sign-in of its own.
  for (const path of ["/login", "/signin", "/sign-in", "/signup", "/auth/login"]) {
    const res = await runtime.fetch(path, { role: "owner" });
    expect(res.status).toBe(404);
  }
  for (const path of ["/api/documents/x/file", "/api/matters/x/documents"]) {
    expect((await runtime.fetch(path)).status).toBeGreaterThanOrEqual(400);
    expect((await runtime.fetch(path, { role: "outsider" })).status).toBeGreaterThanOrEqual(400);
  }

  const memberPage = await (await runtime.context("member")).newPage();
  await memberPage.goto("/");
  await expect(memberPage.locator('input[type="password"]')).toHaveCount(0);

  const page = await (await runtime.context("owner")).newPage();
  const matterId = await createMatter(page, { name: "Board minutes review", client: "Acme Holdings" });
  await upload(page, [txt("Minutes.txt", LEASE)]);
  const row = page.getByTestId("document-row").filter({ hasText: "Minutes.txt" });
  const fileHref = await row.getByTestId("document-open").getAttribute("href");
  const docId = fileHref.split("/")[3];

  // Record the owner's own rename and delete-matter requests to replay as others.
  await row.getByTestId("document-rename").click();
  await page.getByLabel("Document name").fill("Minutes 2025.txt");
  const rename = await captureServerFn(page, () => page.getByTestId("rename-submit").click());
  await expect(page.getByTestId("document-row").filter({ hasText: "Minutes 2025.txt" })).toBeVisible();
  const renamed = rename.body.replace("Minutes 2025.txt", "Hijacked.txt");
  const renameAgain = { ...rename, body: renamed };

  // Not shared: the member sees nothing of the matter.
  await memberPage.goto("/");
  await expect(memberPage.getByTestId("matter-row").filter({ hasText: "Board minutes review" })).toHaveCount(0);
  await memberPage.goto(`/matters/${matterId}`);
  await expect(memberPage.getByText("Matter not found")).toBeVisible();
  expect((await runtime.fetch(fileHref, { role: "member" })).status).toBe(404);
  const form = () => { const f = new FormData(); f.append("file", new Blob(["x"], { type: "text/plain" }), "x.txt"); return f; };
  expect((await runtime.fetch(`/api/matters/${matterId}/documents`, { role: "member", method: "POST", body: form() })).status).toBe(404);
  await replay(runtime, renameAgain, "member");
  expect((await db.prepare("select name from documents where id = ?").bind(docId).first()).name).toBe("Minutes 2025.txt");

  // Shared as viewer: reads, but cannot change anything.
  await page.getByTestId("tab-sharing").click();
  await page.getByTestId("share-user").selectOption({ label: "member@example.test" });
  await page.getByTestId("share-role").selectOption("viewer");
  await page.getByTestId("share-submit").click();
  await expect(page.getByTestId("share-row").filter({ hasText: "member@example.test" })).toBeVisible();
  expect((await runtime.fetch(fileHref, { role: "member" })).status).toBe(200);
  expect((await runtime.fetch(`/api/matters/${matterId}/documents`, { role: "member", method: "POST", body: form() })).status).toBe(403);
  await replay(runtime, renameAgain, "member");
  expect((await db.prepare("select name from documents where id = ?").bind(docId).first()).name).toBe("Minutes 2025.txt");
  await memberPage.goto(`/matters/${matterId}`);
  await expect(memberPage.getByTestId("document-row")).toHaveCount(1);
  await expect(memberPage.getByTestId("upload-input")).toHaveCount(0);
  await expect(memberPage.getByTestId("document-rename")).toHaveCount(0);
  await memberPage.goto(`/matters/${matterId}/assistant`);
  await expect(memberPage.getByTestId("new-thread")).toHaveCount(0);
  await memberPage.goto(`/matters/${matterId}/sharing`);
  await expect(memberPage.getByTestId("delete-matter")).toHaveCount(0);
  await expect(memberPage.getByTestId("share-submit")).toHaveCount(0);

  // Only the owner deletes a matter: replaying the owner's delete as the viewer changes nothing.
  const matterCount = async () => (await db.prepare("select count(*) as n from matters where id = ?").bind(matterId).first()).n;
  const otherId = await createMatter(page, { name: "Scratch matter", client: "Internal" });
  await page.getByTestId("tab-sharing").click();
  await page.getByTestId("share-user").selectOption({ label: "member@example.test" });
  await page.getByTestId("share-role").selectOption("editor");
  await page.getByTestId("share-submit").click();
  await expect(page.getByTestId("share-row")).toHaveCount(1);
  await page.getByTestId("delete-matter").click();
  const del = await captureServerFn(page, () => page.getByTestId("confirm-delete").click());
  await page.waitForURL((u) => u.pathname === "/");
  expect((await db.prepare("select count(*) as n from matters where id = ?").bind(otherId).first()).n).toBe(0);
  await replay(runtime, { ...del, body: del.body.replace(otherId, matterId) }, "member");
  expect(await matterCount()).toBe(1);

  // Admins see every matter: the member's private matter shows for the org owner.
  await createMatter(memberPage, { name: "Member private matter", client: "Solo" });
  await page.goto("/");
  await expect(page.getByTestId("matter-row").filter({ hasText: "Member private matter" })).toBeVisible();

  // Private workflows stay with their author; others cannot delete them.
  await page.goto("/workflows/new");
  await page.getByLabel("Name").fill("Owner draft workflow");
  await page.getByLabel("Instructions").fill("Summarize the document.");
  await page.getByTestId("slot-name").first().fill("Document");
  await Promise.all([page.waitForURL(/\/workflows$/), page.getByTestId("save-workflow").click()]);
  const wfRow = page.getByTestId("workflow-row").filter({ hasText: "Owner draft workflow" });
  await expect(wfRow).toContainText("Private");
  await memberPage.goto("/workflows");
  await expect(memberPage.getByTestId("workflow-row").filter({ hasText: "Owner draft workflow" })).toHaveCount(0);
  await wfRow.getByTestId("delete-workflow").click();
  const wfDel = await captureServerFn(page, () => page.getByTestId("confirm-delete").click());
  await expect(page.getByTestId("workflow-row").filter({ hasText: "Owner draft workflow" })).toHaveCount(0);
  // Recreate it, then replay the delete as the member against the new id.
  await page.goto("/workflows/new");
  await page.getByLabel("Name").fill("Owner second workflow");
  await page.getByLabel("Instructions").fill("Summarize.");
  await page.getByTestId("slot-name").first().fill("Document");
  await page.getByLabel("Publish to the organization").check();
  await Promise.all([page.waitForURL(/\/workflows$/), page.getByTestId("save-workflow").click()]);
  const wf = await db.prepare("select id from workflows where name = ?").bind("Owner second workflow").first();
  const oldWf = wfDel.body.match(/[0-9a-f-]{36}/)[0];
  await replay(runtime, { ...wfDel, body: wfDel.body.replace(oldWf, wf.id) }, "member");
  expect((await db.prepare("select count(*) as n from workflows where id = ?").bind(wf.id).first()).n).toBe(1);
  await memberPage.goto("/workflows");
  const memberWf = memberPage.getByTestId("workflow-row").filter({ hasText: "Owner second workflow" });
  await expect(memberWf).toBeVisible();
  await expect(memberWf.getByTestId("delete-workflow")).toHaveCount(0);
} finally {
  await runtime.close();
}
