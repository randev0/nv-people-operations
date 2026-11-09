import { test, expect, type Page } from "@playwright/test";

const PASSWORD = process.env.DEMO_PASSWORD!;

async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/dashboard");
}

async function signOut(page: Page) {
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL("**/login");
}

test("request lifecycle across employee, manager, IT owner (AI unavailable keeps the draft)", async ({ page }) => {
  const title = `E2E monitor flicker ${Date.now()}`;
  await signIn(page, "employee.my@example.com");
  await page.getByRole("link", { name: "Requests", exact: true }).click();
  await page.getByRole("link", { name: "New request" }).click();
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Description").fill("My external monitor flickers every few seconds since this morning.");
  await page.getByRole("button", { name: "Suggest routing" }).click();
  await expect(page.getByText("Suggestion unavailable")).toBeVisible();
  await expect(page.getByLabel("Title")).toHaveValue(title);
  await page.getByLabel("Category").selectOption({ label: "IT equipment" });
  await page.getByLabel("Priority").selectOption("HIGH");
  await page.getByRole("button", { name: "Submit request" }).click();
  await expect(page.getByRole("heading", { name: new RegExp(title) })).toBeVisible();
  await expect(page.getByText("Submitted", { exact: true }).first()).toBeVisible();
  const url = page.url();
  await signOut(page);

  await signIn(page, "manager.my@example.com");
  await page.goto(url);
  const opt = await page.getByLabel("Assign to").locator("option", { hasText: "Priya Ismail" }).getAttribute("value");
  await page.getByLabel("Assign to").selectOption(opt!);
  await page.getByRole("button", { name: "Assign", exact: true }).click();
  await expect(page.getByText(/assigned it to Priya Ismail/)).toBeVisible();
  await signOut(page);

  await signIn(page, "it.owner@example.com");
  await page.goto("/my-work?kind=request");
  await page.getByRole("link", { name: title }).click();
  await page.getByRole("button", { name: "Start work" }).click();
  await expect(page.getByRole("button", { name: "Mark resolved" })).toBeVisible();
  await page.getByLabel("Add a comment").fill("Replaced the cable; please confirm.");
  await page.getByRole("button", { name: "Post comment" }).click();
  await expect(page.getByText("Replaced the cable; please confirm.")).toBeVisible();
  await page.getByRole("button", { name: "Mark resolved" }).click();
  await expect(page.getByText(/moved it from In progress to Resolved/)).toBeVisible();
  await signOut(page);

  await signIn(page, "employee.my@example.com");
  await page.goto(url);
  await page.getByRole("button", { name: "Close request" }).click();
  await expect(page.getByText(/moved it from Resolved to Closed/)).toBeVisible();
  await page.reload();
  await expect(page.getByText("Replaced the cable; please confirm.")).toBeVisible();
});

test("IT owner completes a prerequisite in My Work and the dependent task unblocks", async ({ page }) => {
  await signIn(page, "it.owner@example.com");
  await page.getByRole("link", { name: "My Work", exact: true }).click();
  const account = page.getByRole("article", { name: "Create company account" });
  await account.getByRole("button", { name: "Mark complete" }).click();
  await expect(account).toHaveCount(0); // leaves the Open list
  const handover = page.getByRole("article", { name: "Hand over laptop and verify login" });
  await expect(handover.getByRole("button", { name: "Start task" })).toBeVisible();
  await handover.getByRole("button", { name: "Start task" }).click();
  await expect(handover.getByText("In progress", { exact: true })).toBeVisible();
  // The owner cannot open the hire's full checklist.
  const res = await page.goto("/onboarding");
  expect(res?.status()).toBe(200);
  await expect(page.getByText("You don't have an onboarding checklist.")).toBeVisible();
});

test("HR creates a template in the editor; a dependency loop is flagged and rejected", async ({ page }) => {
  await signIn(page, "hr.admin@example.com");
  await page.getByRole("link", { name: "Templates" }).click();
  await page.getByRole("link", { name: "New template" }).click();
  await page.getByLabel("Name").fill("E2E template");
  await page.getByRole("button", { name: "Add task" }).click();
  await page.getByLabel("Task 1 title").fill("Order desk");
  await page.getByRole("button", { name: "Add task" }).click();
  await page.getByLabel("Task 2 title").fill("Assemble desk");
  await page.getByLabel("Due day").nth(1).fill("3");
  const t2 = page.getByRole("listitem").filter({ has: page.getByLabel("Task 2 title") });
  await t2.getByLabel("Order desk").check();
  const t1 = page.getByRole("listitem").filter({ has: page.getByLabel("Task 1 title") });
  await t1.getByLabel("Assemble desk").check();
  await expect(page.getByText(/These prerequisites form a loop/)).toBeVisible();
  await page.getByRole("button", { name: "Create template" }).click();
  await expect(page.getByText(/Dependency cycle/).first()).toBeVisible();
  await t1.getByLabel("Assemble desk").uncheck();
  await page.getByRole("button", { name: "Create template" }).click();
  await page.waitForURL("**/templates");
  await expect(page.getByRole("link", { name: "E2E template" })).toBeVisible();
});

test("employee navigation hides HR areas and direct visits are refused", async ({ page }) => {
  await signIn(page, "employee.cy@example.com");
  await expect(page.getByRole("link", { name: "Templates" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Employees" })).toHaveCount(0);
  await page.goto("/templates");
  await expect(page.getByText("Only HR admins can manage templates.")).toBeVisible();
  await page.goto("/employees");
  await expect(page.getByText(/available to managers and HR/)).toBeVisible();
});

test("U01: key screens fit a 390px viewport without horizontal scrolling", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await signIn(page, "hr.admin@example.com");
  for (const path of ["/dashboard", "/requests?scope=all", "/my-work", "/onboarding", "/employees", "/templates", "/requests/new"]) {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
  await page.getByRole("button", { name: "Open menu" }).click();
  await expect(page.getByRole("link", { name: "Templates" })).toBeVisible();
  await ctx.close();
});
