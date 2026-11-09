/**
 * Dashboard "Today": KPI strip, "Needs your attention" groups (requests to assign, own
 * work, onboarding to chase), assigning from the side sheet, action feedback, the
 * caught-up state, always-visible office clocks and keyboard use.
 */
import { test, expect, type Page } from "@playwright/test";

const PASSWORD = process.env.DEMO_PASSWORD ?? "PeopleOps-Demo-2026!";
const PRIORITY = ["Urgent priority", "High priority", "Medium priority", "Low priority"];

async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/dashboard");
}

const group = (page: Page, name: RegExp) => page.getByRole("region", { name });
const rowsOf = (page: Page, name: RegExp) => group(page, name).getByRole("listitem");
const kpi = async (page: Page, label: string) => Number((await page.getByRole("link", { name: new RegExp(`^${label}`) }).first().innerText()).match(/(\d+)\s*$/)![1]);

test.describe.configure({ mode: "serial" });

test("HR: clocks always visible; requests to assign by priority; chase list by days overdue; View all links", async ({ page }) => {
  await signIn(page, "hr.admin@example.com");
  const clocks = page.getByRole("list", { name: "Local time in each office" });
  await expect(clocks.getByRole("listitem")).toHaveCount(4);
  await expect(clocks).toContainText("Nicosia");

  const assign = rowsOf(page, /^Requests to assign/);
  expect(await assign.count()).toBeLessThanOrEqual(3);
  const ranks = (await assign.allInnerTexts()).map((t) => PRIORITY.findIndex((p) => t.startsWith(p)));
  expect(ranks.every((r) => r >= 0)).toBe(true);
  expect([...ranks].sort((a, b) => a - b)).toEqual(ranks);

  const chase = rowsOf(page, /^Onboarding to chase/);
  expect(await chase.count()).toBeLessThanOrEqual(3);
  const days = (await chase.allInnerTexts()).map((t) => Number(t.match(/^(\d+) days? overdue/)![1]));
  expect([...days].sort((a, b) => b - a)).toEqual(days);
  await expect(chase.first()).toContainText("Owner ");

  // "View all" for requests lists every one of them (same number as the Unassigned figure),
  // and from there "Open in Requests" opens the filtered request list with the same count.
  const unassigned = await kpi(page, "Unassigned");
  await group(page, /^Requests to assign/).getByRole("link", { name: /^View all \d+/ }).click();
  await expect(page).toHaveURL(/queue=all/);
  await expect(rowsOf(page, /^Requests to assign/)).toHaveCount(unassigned);
  await group(page, /^Requests to assign/).getByRole("link", { name: "Open in Requests" }).click();
  await expect(page).toHaveURL(/status=SUBMITTED/);
  await expect(page.getByText(`${unassigned} request${unassigned === 1 ? "" : "s"}`, { exact: true })).toBeVisible();
  // "View all" for the chase list opens the overdue task page with exactly that many tasks.
  await page.goto("/dashboard");
  const chaseTotal = Number((await group(page, /^Onboarding to chase/).getByRole("heading").innerText()).match(/\((\d+)\)/)![1]);
  await group(page, /^Onboarding to chase/).getByRole("link", { name: /^View all/ }).click();
  await expect(page).toHaveURL(/\/onboarding\/overdue\?owner=others/);
  await expect(page.getByRole("main").getByRole("listitem")).toHaveCount(chaseTotal);
});

test("HR assigns from the side sheet without leaving the dashboard", async ({ page }) => {
  await signIn(page, "hr.admin@example.com");
  const before = await kpi(page, "Unassigned");
  const first = rowsOf(page, /^Requests to assign/).first();
  const title = (await first.getByRole("link").first().innerText()).trim();
  const trigger = first.getByRole("button", { name: /^Assign/ });
  await trigger.click();
  const sheet = page.getByRole("dialog", { name: title });
  await expect(sheet).toBeVisible();
  // Escape closes it and returns focus to the button that opened it.
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(trigger).toBeFocused();

  await trigger.click();
  // Search narrows the list; the request's team is listed before everyone else.
  const select = sheet.getByLabel("Assign to");
  await expect(select).toBeEnabled();
  const groups = await select.locator("optgroup").evaluateAll((gs) => gs.map((g) => g.getAttribute("label")));
  expect(groups.at(-1)).toBe("Everyone else");
  expect(groups.some((g) => /team \(handles this category\)$/.test(g ?? ""))).toBe(true);
  const total = await select.locator("option").count();
  await sheet.getByLabel("Find a person").fill("IT");
  await expect(sheet.getByText(/^\d+ matching (person|people)$/)).toBeVisible();
  expect(await select.locator("option").count()).toBeLessThan(total);
  await sheet.getByLabel("Find a person").fill("");
  await expect(select).toBeEnabled();
  const value = await select.locator("option").nth(1).getAttribute("value");
  const name = (await select.locator("option").nth(1).innerText()).split(" — ")[0];
  await select.selectOption(value!);
  await sheet.getByRole("button", { name: "Assign", exact: true }).click();
  await expect(sheet).toBeHidden();
  await expect(page.getByRole("status").filter({ hasText: title })).toContainText(`assigned to ${name}`);
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect.poll(() => kpi(page, "Unassigned")).toBe(before - 1);
  await expect(rowsOf(page, /^Requests to assign/).filter({ hasText: title })).toHaveCount(0);
});

test("HR bulk-assigns two requests to one person and the counts update", async ({ page }) => {
  await signIn(page, "hr.admin@example.com");
  const before = await kpi(page, "Unassigned");
  test.skip(before < 2, "needs two unassigned requests");
  await page.goto("/dashboard?queue=all");
  const rows = rowsOf(page, /^Requests to assign/);
  await rows.nth(0).getByRole("checkbox").check();
  await rows.nth(1).getByRole("checkbox").check();
  const bar = page.getByRole("region", { name: "Bulk assign" });
  await expect(bar).toContainText("2 selected");
  const select = bar.getByLabel("Assign selected requests to");
  await expect(select).toBeEnabled();
  const option = select.locator("option").nth(1);
  const name = (await option.innerText()).replace(/ \([A-Z]{2}\)$/, "");
  await select.selectOption((await option.getAttribute("value"))!);
  await bar.getByRole("button", { name: "Assign 2" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Assigned 2 of 2 requests" })).toContainText(`to ${name}`);
  await page.goto("/dashboard");
  await expect.poll(() => kpi(page, "Unassigned")).toBe(before - 2);
});

test("Overdue figure opens the overdue task list with the same count; filters narrow it; employees are refused", async ({ page }) => {
  await signIn(page, "hr.admin@example.com");
  const card = page.getByRole("link", { name: /^Overdue tasks/ });
  const n = Number(await card.locator(":scope > span").nth(1).textContent());
  await card.click();
  await expect(page).toHaveURL(/\/onboarding\/overdue$/);
  await expect(page.getByRole("heading", { level: 1, name: "Overdue onboarding tasks" })).toBeVisible();
  const items = page.getByRole("main").getByRole("listitem");
  await expect(items).toHaveCount(n);
  const days = (await items.allInnerTexts()).map((t) => Number(t.match(/^(\d+) days? overdue/)![1]));
  expect([...days].sort((a, b) => b - a)).toEqual(days);
  await page.getByLabel("State").selectOption("BLOCKED");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page).toHaveURL(/state=BLOCKED/);
  for (const t of await items.allInnerTexts()) expect(t).toContain("Waiting for");
  await page.context().clearCookies();
  await signIn(page, "employee.cy@example.com");
  await page.goto("/onboarding/overdue");
  await expect(page.getByText(/available to HR admins and managers/)).toBeVisible();
});

test("IT owner: own work in rule order, action confirms and refreshes, title opens the record", async ({ page }) => {
  await signIn(page, "it.owner@example.com");
  const rows = rowsOf(page, /^Your work/);
  await expect(rows.first()).toBeVisible();
  const first = rows.first();
  const title = (await first.getByRole("link").first().innerText()).trim();
  // Titles repeat across checklists ("Create company account" for several hires); the link is unique.
  const href = await first.getByRole("link").first().getAttribute("href");
  const button = first.getByRole("button");
  const before = (await button.innerText()).trim();
  await button.click();
  const status = page.getByRole("status").filter({ hasText: title });
  await expect(status).toContainText("Your list has been updated.");
  await expect
    .poll(async () => {
      const row = rows.filter({ has: page.locator(`a[href="${href}"]`) });
      return (await row.count()) === 0 ? "gone" : (await row.getByRole("button").innerText()).trim();
    }, { timeout: 15_000, message: "row should leave the list or offer its next step after the refresh" })
    .not.toBe(before);
  const link = rows.first().getByRole("link").first();
  const next = (await link.innerText()).trim();
  await link.click();
  await expect(page).toHaveURL(/\/(requests|onboarding)\/[0-9a-f-]+/);
  await expect(page.getByText(next).first()).toBeVisible();
});

test("manager: only their team in the chase list and the equipment line", async ({ page }) => {
  await signIn(page, "manager.my@example.com");
  const team = await page.getByRole("region", { name: "Onboarding now" }).getByRole("listitem").allInnerTexts();
  const teamNames = team.map((t) => t.split("\n")[1] ?? t);
  for (const t of await rowsOf(page, /^Team onboarding to chase/).allInnerTexts()) {
    expect(teamNames.some((n) => t.includes(n.trim()))).toBe(true);
  }
  const insight = page.getByRole("region", { name: "IT equipment for new hires" });
  await expect(insight).toContainText(/in your team who joined in the last 60 days/);
  await insight.getByRole("link", { name: "Review requests" }).click();
  await expect(page).toHaveURL(/scope=team&insight=new-hires-it/);
});

test("nothing to act on: caught-up state with onward links; employees see no org reporting", async ({ page }) => {
  await signIn(page, "employee.cy@example.com");
  await expect(page.getByText("You're all caught up.")).toBeVisible();
  const attention = page.getByRole("region", { name: "Needs your attention" });
  await expect(attention.getByRole("link", { name: "Requests", exact: true })).toHaveAttribute("href", "/requests");
  await expect(attention.getByRole("link", { name: "Onboarding" })).toBeVisible();
  await expect(page.getByRole("region", { name: "At a glance" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /^My open requests/ })).toBeVisible();
});
