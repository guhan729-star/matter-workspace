import { startRuntime, expect } from "/home/user/oss-new/control/runtime/index.mjs";
import { LEASE, SIDE_LETTER, withFakeAi, txt, createMatter, upload } from "./lib.mjs";

const runtime = await startRuntime(withFakeAi);
try {
  // The member opens the app once, so the owner can share with them.
  const memberPage = await (await runtime.context("member")).newPage();
  await memberPage.goto("/");
  await expect(memberPage.getByRole("heading", { level: 1, name: "Matters" })).toBeVisible();

  const page = await (await runtime.context("owner")).newPage();

  // F001: a matter, its documents and sharing.
  const matterId = await createMatter(page, {
    name: "Dockside lease renewal",
    client: "Northwind Logistics",
    description: "Renewal of the Unit 4 warehouse lease and side letter.",
  });
  await runtime.assertBackLink(page);
  await expect(page.getByText("No documents yet")).toBeVisible();
  await upload(page, [txt("Lease agreement.txt", LEASE), txt("Side letter.txt", SIDE_LETTER)]);
  const leaseRow = page.getByTestId("document-row").filter({ hasText: "Lease agreement.txt" });
  await expect(leaseRow).toContainText("TXT");
  await expect(leaseRow).toContainText("owner@example.test");
  await expect(leaseRow).toContainText(/KB|B/);

  const openHref = await leaseRow.getByTestId("document-open").getAttribute("href");
  expect(openHref).toMatch(/^\/api\/documents\/[^/]+\/file$/);
  const opened = await runtime.fetch(openHref, { role: "owner" });
  expect(opened.status).toBe(200);
  expect(await opened.text()).toContain("Dockside Avenue");
  const downloaded = await runtime.fetch(`${openHref}?download=1`, { role: "owner" });
  expect(downloaded.headers.get("content-disposition")).toContain("attachment");

  // Rename a document.
  const sideRow = page.getByTestId("document-row").filter({ hasText: "Side letter.txt" });
  await sideRow.getByTestId("document-rename").click();
  await page.getByLabel("Document name").fill("Side letter 2025.txt");
  await page.getByTestId("rename-submit").click();
  await expect(page.getByTestId("document-row").filter({ hasText: "Side letter 2025.txt" })).toBeVisible();

  // An unsupported type is refused.
  await page.getByTestId("upload-input").setInputFiles([{ name: "photo.png", mimeType: "image/png", buffer: Buffer.from("png") }]);
  await expect(page.getByText(/PDF, DOCX or TXT/)).toBeVisible();

  // Share with the member as a viewer, then make them an editor.
  await page.getByTestId("tab-sharing").click();
  await page.getByTestId("share-user").selectOption({ label: "member@example.test" });
  await page.getByTestId("share-role").selectOption("viewer");
  await page.getByTestId("share-submit").click();
  const shareRow = page.getByTestId("share-row").filter({ hasText: "member@example.test" });
  await expect(shareRow.getByTestId("share-row-role")).toHaveValue("viewer");
  await shareRow.getByTestId("share-row-role").selectOption("editor");
  await expect(page.getByText("Role updated")).toBeVisible();

  // The matter now shows in the member's list.
  await memberPage.goto("/");
  await expect(memberPage.getByTestId("matter-row").filter({ hasText: "Dockside lease renewal" })).toBeVisible();

  // F002: an assistant thread grounded in the documents.
  await page.getByTestId("tab-assistant").click();
  await Promise.all([page.waitForURL(/\/assistant\/[^/]+$/), page.getByTestId("new-thread").click()]);
  await expect(page.getByTestId("thread-doc")).toHaveCount(2);
  for (const box of await page.getByTestId("thread-doc").all()) await expect(box).toBeChecked();
  await page.getByTestId("composer").fill("Can the tenant assign the lease without consent?");
  await page.getByTestId("send").click();
  const reply = page.getByTestId("message-assistant").last();
  await expect(reply).toContainText("assign");
  const citation = reply.getByTestId("citation").first();
  await expect(citation).toContainText(/Lease agreement\.txt|Side letter 2025\.txt/);
  expect(await citation.getByRole("link").first().getAttribute("href")).toMatch(/^\/api\/documents\//);
  await page.getByTestId("rename-thread").click();
  await page.getByLabel("Thread name").fill("Assignment rights");
  await page.getByTestId("rename-thread-submit").click();
  await expect(page.getByRole("heading", { name: "Assignment rights" })).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("message-assistant")).toHaveCount(1);

  // F004: build and publish a workflow, run it in the matter.
  await page.goto("/workflows/new");
  await page.getByLabel("Name").fill("Lease key terms");
  await page.getByLabel("Description").fill("Pulls the commercial terms out of a lease.");
  await page.getByLabel("Instructions").fill("1. Read the lease.\n2. List the term, rent and assignment rules.");
  await page.getByTestId("slot-name").first().fill("Lease");
  await page.getByTestId("output-format").selectOption("table");
  await page.getByLabel("Fields").fill("Term, Rent, Assignment");
  await page.getByLabel("Publish to the organization").check();
  await Promise.all([page.waitForURL(/\/workflows$/), page.getByTestId("save-workflow").click()]);
  await expect(page.getByTestId("workflow-row").filter({ hasText: "Lease key terms" })).toContainText("Published");

  await memberPage.goto("/workflows");
  await expect(memberPage.getByTestId("workflow-row").filter({ hasText: "Lease key terms" })).toBeVisible();

  await page.goto(`/matters/${matterId}/workflows`);
  await page.getByTestId("run-workflow-select").selectOption({ label: "Lease key terms" });
  await page.getByTestId("slot-document").first().selectOption({ label: "Lease agreement.txt" });
  await page.getByLabel("Extra context").fill("Focus on the renewal.");
  await Promise.all([page.waitForURL(/\/runs\/[^/]+$/), page.getByTestId("run-workflow").click()]);
  await expect(page.getByTestId("run-status")).toHaveText("Done");
  await expect(page.getByTestId("run-output")).toContainText("186000");
  await page.getByTestId("tab-workflows").click();
  await expect(page.getByTestId("run-row").filter({ hasText: "Lease key terms" })).toContainText("Done");

  // F005: a checklist generated from documents, with its activity log.
  await page.getByTestId("tab-checklists").click();
  await page.getByTestId("new-checklist").click();
  await page.getByLabel("Checklist name").fill("Renewal obligations");
  await page.getByTestId("checklist-mode").selectOption("generate");
  await Promise.all([page.waitForURL(/\/checklists\/[^/]+$/), page.getByTestId("create-checklist-submit").click()]);
  const items = page.getByTestId("item-row");
  await expect(items.first()).toBeVisible();
  const rentItem = items.filter({ hasText: "annual rent" });
  await expect(rentItem).toContainText("Clause 3.1");
  await rentItem.getByTestId("item-status").selectOption("done");
  await expect(page.getByTestId("activity").first()).toContainText(/Open → Done/);
  await rentItem.getByTestId("item-owner").selectOption({ label: "member@example.test" });
  await expect(page.getByTestId("activity").first()).toContainText("member@example.test");
  await page.getByTestId("new-item-title").fill("Confirm insurance certificate");
  await page.getByTestId("add-item").click();
  await expect(items.filter({ hasText: "Confirm insurance certificate" })).toBeVisible();
  await page.getByTestId("filter-status").selectOption("done");
  await expect(items).toHaveCount(1);
  await page.getByTestId("filter-status").selectOption("");
  await page.getByTestId("add-column-name").fill("Counterparty note");
  await page.getByTestId("add-column").click();
  await expect(page.getByRole("columnheader", { name: "Counterparty note" })).toBeVisible();

  // F003: a review grid over both documents.
  await page.getByTestId("tab-reviews").click();
  await page.getByTestId("new-review").click();
  await page.getByLabel("Review name").fill("Lease terms review");
  await Promise.all([page.waitForURL(/\/reviews\/[^/]+$/), page.getByTestId("create-review-submit").click()]);
  async function addColumn(label, prompt, format, choices) {
    await page.getByTestId("add-column").click();
    await page.getByLabel("Label").fill(label);
    await page.getByLabel("Prompt").fill(prompt);
    await page.getByTestId("column-format").selectOption(format);
    if (choices) await page.getByLabel("Choices").fill(choices);
    await page.getByTestId("save-column").click();
    await expect(page.getByRole("columnheader", { name: new RegExp(label) })).toBeVisible();
  }
  await addColumn("End date", "When does the term end?", "date");
  await addColumn("Assignment", "Can the tenant assign the lease without consent?", "yes_no");
  await addColumn("Rent", "What is the annual rent in dollars?", "number");
  await page.getByTestId("run-all").click();
  const cells = page.getByTestId("cell");
  await expect(cells).toHaveCount(6);
  const endDate = page.locator('[data-testid="cell"][data-column="End date"][data-document="Lease agreement.txt"]');
  await expect(endDate).toContainText("31 December 2029");
  await expect(page.locator('[data-testid="cell"][data-column="Assignment"][data-document="Lease agreement.txt"]')).toContainText("No");

  // Expand a cell, mark it reviewed, lock it.
  await endDate.click();
  const detail = page.getByRole("dialog");
  await expect(detail).toContainText("2.1 The term begins");
  await expect(detail).toContainText("Clause 2.1");
  await detail.getByTestId("mark-reviewed").click();
  await expect(detail).toContainText("Reviewed by owner@example.test");
  await detail.getByTestId("lock-cell").click();
  await expect(detail.getByTestId("cell-answer")).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("review-progress")).toContainText("1 / 6");

  // Edit a cell by hand.
  await page.locator('[data-testid="cell"][data-column="Rent"][data-document="Side letter 2025.txt"]').click();
  await page.getByRole("dialog").getByTestId("cell-answer").fill("0");
  await page.getByRole("dialog").getByTestId("save-cell").click();
  await page.keyboard.press("Escape");
  await expect(page.locator('[data-testid="cell"][data-column="Rent"][data-document="Side letter 2025.txt"]')).toContainText("0");

  // Filter and sort.
  await page.getByTestId("filter-column").selectOption("Assignment");
  await page.getByTestId("filter-value").fill("Yes");
  await expect(page.getByTestId("review-row")).toHaveCount(1);
  await page.getByTestId("filter-value").fill("");
  await expect(page.getByTestId("review-row")).toHaveCount(2);

  // Save the columns as a template and see it offered for a new review.
  await page.getByTestId("save-template").click();
  await page.getByLabel("Template name").fill("Lease basics");
  await page.getByTestId("save-template-submit").click();
  await expect(page.getByText("Template saved")).toBeVisible();
  const reviewUrl = page.url();
  await page.getByTestId("tab-reviews").click();
  await page.getByTestId("new-review").click();
  await page.getByLabel("Review name").fill("Side letter check");
  await page.getByTestId("review-template").selectOption({ label: "Lease basics" });
  await Promise.all([page.waitForURL((u) => u.href !== reviewUrl && /\/reviews\/[^/]+$/.test(u.pathname)), page.getByTestId("create-review-submit").click()]);
  await expect(page.getByRole("columnheader", { name: /End date/ })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: /Rent/ })).toBeVisible();

  await page.goto(reviewUrl);
  await expect(page.getByTestId("review-progress")).toContainText("1 / 6");
  await runtime.screenshot(page);

  // Phone-sized smoke.
  const phone = await (await runtime.context("member", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
  await phone.goto("/");
  await expect(phone.getByRole("heading", { level: 1, name: "Matters" })).toBeVisible();
  await expect(phone.getByTestId("matter-row").first()).toBeVisible();
  await phone.goto(`/matters/${matterId}/reviews`);
  await expect(phone.getByText("Lease terms review")).toBeVisible();
} finally {
  await runtime.close();
}
