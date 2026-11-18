import { startRuntime, expect } from "/home/user/oss-new/control/runtime/index.mjs";
import { LEASE, txt, createMatter, upload } from "./lib.mjs";

// The default runtime: the Gateway has no AI configured.
const runtime = await startRuntime();
try {
  let page = await (await runtime.context("owner")).newPage();
  const matterId = await createMatter(page, { name: "Supplier contract audit", client: "Globex" });
  await upload(page, [txt("Supply agreement.txt", LEASE)]);

  // With no model, the AI features say so instead of failing.
  await page.getByTestId("tab-assistant").click();
  await Promise.all([page.waitForURL(/\/assistant\/[^/]+$/), page.getByTestId("new-thread").click()]);
  await expect(page.getByTestId("ai-off")).toBeVisible();
  await expect(page.getByTestId("composer")).toBeDisabled();

  await page.goto("/workflows/new");
  await page.getByLabel("Name").fill("Contract summary");
  await page.getByLabel("Instructions").fill("Summarize the key obligations.");
  await page.getByTestId("slot-name").first().fill("Contract");
  await Promise.all([page.waitForURL(/\/workflows$/), page.getByTestId("save-workflow").click()]);
  await page.goto(`/matters/${matterId}/workflows`);
  await page.getByTestId("run-workflow-select").selectOption({ label: "Contract summary" });
  await page.getByTestId("slot-document").first().selectOption({ label: "Supply agreement.txt" });
  await page.getByTestId("run-workflow").click();
  await expect(page.getByTestId("ai-off")).toBeVisible();

  await page.getByTestId("tab-reviews").click();
  await page.getByTestId("new-review").click();
  await page.getByLabel("Review name").fill("Obligations grid");
  await Promise.all([page.waitForURL(/\/reviews\/[^/]+$/), page.getByTestId("create-review-submit").click()]);
  const reviewUrl = page.url();
  await page.getByTestId("add-column").click();
  await page.getByLabel("Label").fill("Governing law");
  await page.getByLabel("Prompt").fill("Which law governs?");
  await page.getByTestId("save-column").click();
  await page.getByTestId("run-all").click();
  await expect(page.getByTestId("ai-off")).toBeVisible();

  await page.getByTestId("tab-checklists").click();
  await page.getByTestId("new-checklist").click();
  await page.getByLabel("Checklist name").fill("Closing items");
  await Promise.all([page.waitForURL(/\/checklists\/[^/]+$/), page.getByTestId("create-checklist-submit").click()]);
  const checklistUrl = page.url();
  await page.getByTestId("new-item-title").fill("Collect signed certificate");
  await page.getByTestId("add-item").click();
  await page.getByTestId("item-row").first().getByTestId("item-status").selectOption("blocked");
  await expect(page.getByTestId("activity").first()).toContainText(/Open → Blocked/);

  await runtime.restart();
  page = await (await runtime.context("owner")).newPage();

  await page.goto("/");
  await expect(page.getByTestId("matter-row").filter({ hasText: "Supplier contract audit" })).toBeVisible();
  await page.goto(`/matters/${matterId}`);
  const href = await page.getByTestId("document-row").getByTestId("document-open").getAttribute("href");
  expect(await (await runtime.fetch(href, { role: "owner" })).text()).toContain("Dockside Avenue");
  await page.goto(checklistUrl);
  await expect(page.getByTestId("item-row").first().getByTestId("item-status")).toHaveValue("blocked");
  await expect(page.getByTestId("activity").first()).toContainText(/Open → Blocked/);
  await page.goto(reviewUrl);
  await expect(page.getByRole("columnheader", { name: /Governing law/ })).toBeVisible();
  await page.goto("/workflows");
  await expect(page.getByTestId("workflow-row").filter({ hasText: "Contract summary" })).toBeVisible();
} finally {
  await runtime.close();
}
