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
    await page.getByRole("complementary", { name: "Main navigation" }).getByRole("link", { name: "Requests", exact: true }).click();
    await page.getByRole("link", { name: "New request" }).click();
    await page.getByLabel("Title").fill(TITLE);
    await page.getByLabel("Description").fill("I need a licence for the design tool to prepare onboarding slides for my team this week.");
    await page.getByLabel("Category").selectOption({ label: "Software access" });
    await page.getByRole("button", { name: "Submit request" }).click();
    await expect(page.getByRole("heading", { name: new RegExp(TITLE) })).toBeVisible();
    await expect(page.locator("header").getByText("Submitted", { exact: true })).toBeVisible();

    // Later: find it again from the queue.
    await page.getByRole("complementary", { name: "Main navigation" }).getByRole("link", { name: "Requests", exact: true }).click();
    const row = page.getByRole("row", { name: new RegExp(TITLE) });
    await expect(row).toBeVisible();
    await expect(row.getByText("Submitted", { exact: true })).toBeVisible();
    await expect(row.getByText("Unassigned")).toBeVisible();
  });

  test("2 · manager finds the unassigned team request, assigns it, sees the new state; filters survive the round trip", async ({ page }) => {
    await signIn(page, "manager.my@example.com");
    // Today lists it as assignment work; the full "Needs assignment" view lives in Insights.
    await page.goto("/dashboard?queue=all");
    await expect(page.getByRole("listitem").filter({ hasText: TITLE }).getByRole("button", { name: /^Assign/ })).toBeVisible();
    await page.getByRole("navigation", { name: "Dashboard views" }).getByRole("link", { name: "Insights" }).click();
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

  test("4 · HR opens the equipment queue and reaches the records behind the number", async ({ page }) => {
    await signIn(page, "hr.admin@example.com");
    await page.goto("/dashboard?tab=insights");
    const queue = page.getByRole("region", { name: "New hires waiting on IT equipment" });
    // Hires and requests are counted separately and both are stated.
    const meta = await queue.getByText(/\d+ hires? · \d+ open requests?/).textContent();
    const [hires, requests] = meta!.match(/\d+/g)!.map(Number);
    expect(hires).toBeGreaterThan(0);
    const items = queue.getByRole("listitem");
    await expect(items).toHaveCount(requests);
    // Longest wait first: waiting days never increase down the list.
    const waits = (await items.allTextContents()).map((t) => Number(t.match(/(\d+) days?since/)![1]));
    expect([...waits].sort((a, b) => b - a)).toEqual(waits);
    // The title link opens that exact request.
    const firstLink = items.first().getByRole("link").first();
    const title = (await firstLink.textContent())!.trim();
    await firstLink.click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText(title);
    await page.getByRole("link", { name: "Back to requests" }).click();
    await expect(page).toHaveURL(/insight=new-hires-it/);
    await expect(page.locator("table tbody tr")).toHaveCount(requests);
    // The main button opens the same filtered list.
    await page.goto("/dashboard?tab=insights");
    await queue.getByRole("link", { name: /Open (this request|these \d+ requests)/ }).click();
    await expect(page.getByText("New hires waiting on IT equipment:")).toBeVisible();
    await expect(page.getByText(`${requests} request${requests === 1 ? "" : "s"}`, { exact: true })).toBeVisible();
  });

  test("5 · HR Insights: overdue tasks near the top, metric links match their numbers", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page, "hr.admin@example.com");
    await page.goto("/dashboard?tab=insights");
    const overdue = page.getByRole("region", { name: "Most overdue onboarding tasks" });
    const firstTask = overdue.getByRole("listitem").first();
    await expect(firstTask).toBeInViewport();
    // Next action opens the checklist at that task.
    await firstTask.getByRole("link", { name: /Open in checklist/ }).click();
    await expect(page).toHaveURL(/\/onboarding\/[0-9a-f-]+#task-/);
    await page.goto("/dashboard?tab=insights");
    // "Open requests" number = rows in the list it opens.
    const open = page.getByRole("link", { name: /^Open requests\s*\d+/ });
    const n = Number(await open.locator(":scope > span").nth(1).textContent());
    await open.click();
    await expect(page.getByText(`${n} request${n === 1 ? "" : "s"}`, { exact: true })).toBeVisible();
    await page.goto("/dashboard?tab=insights");
    const resolved = page.getByRole("link", { name: /^Resolved, last 7 days\s*\d+/ });
    const r = Number(await resolved.locator(":scope > span").nth(1).textContent());
    await resolved.click();
    await expect(page.getByText(r === 0 ? "No requests match these filters." : `${r} request${r === 1 ? "" : "s"}`, { exact: true })).toBeVisible();
    // Office pins: keyboard focus reveals city and country.
    await page.goto("/dashboard?tab=insights");
    const pin = page.getByRole("link", { name: /^Nicosia, Cyprus:/ });
    await expect(pin.getByRole("tooltip")).toHaveCSS("opacity", "0");
    await pin.focus();
    await expect(pin.getByRole("tooltip")).toHaveCSS("opacity", "1");
    await expect(pin.getByRole("tooltip")).toContainText("Nicosia, Cyprus");
  });
});
