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
    // Today lists it as assignment work; the "Unassigned" figure opens the team's list.
    await page.goto("/dashboard?queue=all");
    await expect(page.getByRole("listitem").filter({ hasText: TITLE }).getByRole("button", { name: /^Assign/ })).toBeVisible();
    await page.getByRole("link", { name: /^Unassigned/ }).click();
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

  test("4 · HR follows the IT-equipment line to exactly the records behind it", async ({ page }) => {
    await signIn(page, "hr.admin@example.com");
    const line = page.getByRole("region", { name: "IT equipment for new hires" });
    // People and requests are counted separately and both are stated.
    const text = (await line.innerText()).replace(/\s+/g, " ");
    const m = text.match(/(\d+) (?:person|people) who joined in the last 60 days (?:has|have) (\d+) open IT equipment requests?/)!;
    const requests = Number(m[2]);
    expect(Number(m[1])).toBeGreaterThan(0);
    await line.getByRole("link", { name: "Review requests" }).click();
    await expect(page).toHaveURL(/insight=new-hires-it/);
    await expect(page.getByText("New hires waiting on IT equipment:")).toBeVisible();
    const rows = page.locator("table tbody tr");
    await expect(rows).toHaveCount(requests);
    for (const t of await rows.allInnerTexts()) expect(t).toContain("IT equipment");
    // A row opens that exact request, and Back keeps the filter.
    const firstLink = rows.first().getByRole("link").first();
    const title = (await firstLink.textContent())!.trim();
    await firstLink.click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText(title);
    await page.getByRole("link", { name: "Back to requests" }).click();
    await expect(page).toHaveURL(/insight=new-hires-it/);
  });

  test("5 · HR dashboard: chase list in the first screen, every figure matches the list it opens, reporting below", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page, "hr.admin@example.com");
    await expect(page.getByRole("navigation", { name: "Dashboard views" })).toHaveCount(0); // one page, no tabs
    const firstTask = page.getByRole("region", { name: /^Onboarding to chase/ }).getByRole("listitem").first();
    await expect(firstTask).toBeVisible();
    await firstTask.getByRole("link", { name: /Open checklist/ }).click();
    await expect(page).toHaveURL(/\/onboarding\/[0-9a-f-]+#task-/);

    const figure = async (name: RegExp) => {
      await page.goto("/dashboard");
      const l = page.getByRole("link", { name }).first();
      const n = Number((await l.locator(":scope > span").nth(1).textContent())!.trim());
      await l.click();
      return n;
    };
    const count = (n: number) => page.getByText(n === 0 ? "No requests match these filters." : `${n} request${n === 1 ? "" : "s"}`, { exact: true });
    await expect(count(await figure(/^Open requests/))).toBeVisible();
    await expect(count(await figure(/^Unassigned/))).toBeVisible();
    const overdue = await figure(/^Overdue tasks/);
    await expect(page).toHaveURL(/\/onboarding\/overdue$/);
    await expect(page.getByRole("main").getByRole("listitem")).toHaveCount(overdue);
    await expect(count(await figure(/^Resolved, last 7 days/))).toBeVisible();

    // Reporting required by the brief is on the same page, under "At a glance".
    await page.goto("/dashboard");
    const glance = page.getByRole("region", { name: "At a glance" });
    for (const name of ["Open requests by status", "Open requests by category", "Headcount by office", "Request flow"]) {
      await expect(glance.getByRole("region", { name })).toBeVisible();
    }
    // Old Insights links land on that section.
    await page.goto("/dashboard?tab=insights");
    await expect(page).toHaveURL(/\/dashboard#at-a-glance$/);
    // Office pins: keyboard focus reveals city and country.
    const pin = page.getByRole("link", { name: /^Nicosia, Cyprus:/ });
    await expect(pin.getByRole("tooltip")).toHaveCSS("opacity", "0");
    await pin.focus();
    await expect(pin.getByRole("tooltip")).toHaveCSS("opacity", "1");
    await expect(pin.getByRole("tooltip")).toContainText("Nicosia, Cyprus");
  });
});
