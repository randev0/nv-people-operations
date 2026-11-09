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
    await page.goto("/dashboard");
    const assignTab = page.getByRole("tab", { name: /^Assign requests · \d+/ });
    await expect(assignTab).toHaveAttribute("aria-selected", "true");
    await page.getByRole("button", { name: "Select", exact: true }).click(); // selection mode lists every assignable request
    await expect(page.getByRole("checkbox", { name: new RegExp(TITLE) })).toBeVisible();
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
    // People and requests are counted separately and both are stated.
    const m = text.match(/(\d+) (?:person|people) who joined in the last 60 days (?:has|have) (\d+) open IT equipment requests?/)!;
    const hires = Number(m[1]);
    const requests = Number(m[2]);
    expect(hires).toBeGreaterThan(0);
    // Insights states the same two numbers.
    await page.goto("/dashboard?tab=insights");
    const panel = page.getByRole("region", { name: "IT equipment for new hires" });
    await expect(panel.getByRole("link", { name: /^Open requests/ })).toContainText(String(requests));
    await expect(panel).toContainText(`New hires waiting${hires}`);
    await page.goto("/dashboard");
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

  test("5 · HR dashboard: Today and Insights tabs; every figure matches the list it opens; all required reporting in Insights", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page, "hr.admin@example.com");
    const views = page.getByRole("navigation", { name: "Dashboard views" });
    await expect(views.getByRole("link", { name: "Today" })).toHaveAttribute("aria-current", "page");
    // The core of Today fits a laptop screen: the work list and the equipment line are above the fold.
    const attention = page.getByRole("region", { name: "Needs your attention" });
    await expect(attention.getByRole("tabpanel").getByRole("listitem").first()).toBeInViewport();
    await expect(page.getByRole("region", { name: "IT equipment for new hires" })).toBeInViewport();
    expect(await page.getByRole("region", { name: "Open requests by status" }).count()).toBe(0); // reporting is not on Today

    const figure = async (path: string, name: RegExp) => {
      await page.goto(path);
      const l = page.getByRole("link", { name }).first();
      await l.waitFor(); // the page streams in after a loading state; count() below does not wait
      const v = l.locator("[data-value]");
      const n = Number((await ((await v.count()) ? v : l.locator(":scope > span").nth(1)).textContent())!.trim());
      await l.click();
      return n;
    };
    const count = (n: number) => page.getByText(n === 0 ? "No requests match these filters." : `${n} request${n === 1 ? "" : "s"}`, { exact: true });
    await expect(count(await figure("/dashboard", /^Open requests/))).toBeVisible();
    await expect(count(await figure("/dashboard", /^Unassigned/))).toBeVisible();
    const overdue = await figure("/dashboard", /^Overdue tasks/);
    await expect(page).toHaveURL(/\/onboarding\/overdue$/);
    await expect(page.getByRole("main").getByRole("listitem")).toHaveCount(overdue);
    await expect(count(await figure("/dashboard?tab=insights", /^Resolved, last 7 days/))).toBeVisible();
    // Insights' overdue total opens the same list.
    const overdue2 = await figure("/dashboard?tab=insights", /^Overdue\s*\d+$/);
    expect(overdue2).toBe(overdue);
    await expect(page).toHaveURL(/\/onboarding\/overdue$/);

    await page.goto("/dashboard");
    await views.getByRole("link", { name: "Insights" }).click();
    await expect(page).toHaveURL(/tab=insights/);
    await expect(views.getByRole("link", { name: "Insights" })).toHaveAttribute("aria-current", "page");
    for (const name of ["Overdue onboarding tasks", "IT equipment for new hires", "Onboarding progress", "Open requests by status", "Open requests by category", "Headcount by office", "Request flow"]) {
      await expect(page.getByRole("region", { name })).toBeVisible();
    }
    // Overdue by office narrows the overdue list.
    const office = page.getByRole("list", { name: "Overdue tasks by office" }).getByRole("link").first();
    const perOffice = Number((await office.locator("span").textContent())!.trim());
    await office.click();
    await expect(page).toHaveURL(/countryCode=/);
    await expect(page.getByRole("main").getByRole("listitem")).toHaveCount(perOffice);
    // Office pins: keyboard focus reveals city and country.
    await page.goto("/dashboard?tab=insights");
    const pin = page.getByRole("link", { name: /^Nicosia, Cyprus:/ });
    await expect(pin.getByRole("tooltip")).toHaveCSS("opacity", "0");
    await pin.focus();
    await expect(pin.getByRole("tooltip")).toHaveCSS("opacity", "1");
    await expect(pin.getByRole("tooltip")).toContainText("Nicosia, Cyprus");
  });
});
