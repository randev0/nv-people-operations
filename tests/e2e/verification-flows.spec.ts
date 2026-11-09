/**
 * The four UI verification flows from the presentation brief, run against seeded data.
 * (Flow 3 — blocked task → prerequisite → unblocked — lives in flows.spec.ts because it
 * shares the seeded "Create company account" task with the lifecycle tests.)
 */
import { test, expect, type Page } from "@playwright/test";

const PASSWORD = process.env.DEMO_PASSWORD!;
const TITLE = `Access to design tool licence ${Date.now()}`;

async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/dashboard");
}

test.describe.serial("presentation verification flows", () => {
  test("1 · employee submits a software-access request and finds its status afterwards", async ({ page }) => {
    await signIn(page, "employee.my@example.com");
    await page.getByRole("link", { name: "Requests", exact: true }).click();
    await page.getByRole("link", { name: "New request" }).click();
    await page.getByLabel("Title").fill(TITLE);
    await page.getByLabel("Description").fill("I need a licence for the design tool to prepare onboarding slides for my team this week.");
    await page.getByLabel("Category").selectOption({ label: "Software access" });
    await page.getByRole("button", { name: "Submit request" }).click();
    await expect(page.getByRole("heading", { name: new RegExp(TITLE) })).toBeVisible();
    await expect(page.locator("header").getByText("Submitted", { exact: true })).toBeVisible();

    // Later: find it again from the queue.
    await page.getByRole("link", { name: "Requests", exact: true }).click();
    const row = page.getByRole("row", { name: new RegExp(TITLE) });
    await expect(row).toBeVisible();
    await expect(row.getByText("Submitted", { exact: true })).toBeVisible();
    await expect(row.getByText("Unassigned")).toBeVisible();
  });

  test("2 · manager finds the unassigned team request, assigns it, sees the new state; filters survive the round trip", async ({ page }) => {
    await signIn(page, "manager.my@example.com");
    await page.getByRole("link", { name: /Needs assignment/ }).click();
    await expect(page).toHaveURL(/scope=team.*status=SUBMITTED|status=SUBMITTED.*scope=team/);
    await page.getByRole("row", { name: new RegExp(TITLE) }).getByRole("link", { name: TITLE }).click();
    await expect(page.getByRole("heading", { name: new RegExp(TITLE) })).toBeVisible();

    const select = page.getByLabel("Assign to");
    await expect(select.locator("option", { hasText: "Priya Ismail" })).toHaveCount(1);
    await select.selectOption((await select.locator("option", { hasText: "Priya Ismail" }).getAttribute("value"))!);
    await page.getByRole("button", { name: "Assign", exact: true }).click();
    await expect(page.getByText("Assigned to Priya Ismail")).toBeVisible();
    await expect(page.locator("header").getByText("Assigned", { exact: true })).toBeVisible();
    await expect(page.getByText(/assigned it to Priya Ismail/)).toBeVisible();

    await page.getByRole("link", { name: "Back to requests" }).click();
    await expect(page).toHaveURL(/status=SUBMITTED/);
    await expect(page.getByRole("row", { name: new RegExp(TITLE) })).toHaveCount(0); // no longer unassigned
  });

  test("4 · HR opens the dashboard insight and reaches the records behind the number", async ({ page }) => {
    await signIn(page, "hr.admin@example.com");
    const insight = page.getByRole("region", { name: /new hires? (is|are) still waiting on IT equipment/ });
    const button = insight.getByRole("link", { name: /Open the \d+ requests?/ });
    const n = Number((await button.textContent())!.match(/\d+/)![0]);
    await button.click();
    await expect(page.getByText("Showing the records behind the dashboard insight")).toBeVisible();
    await expect(page.getByText(`${n} request${n === 1 ? "" : "s"}`, { exact: true })).toBeVisible();
    const rows = page.locator("table tbody tr");
    await expect(rows).toHaveCount(n);
    await rows.first().getByRole("link").first().click();
    await expect(page.getByText("IT equipment").first()).toBeVisible();
    await page.getByRole("link", { name: "Back to requests" }).click();
    await expect(page).toHaveURL(/insight=new-hires-it/);
  });
});
