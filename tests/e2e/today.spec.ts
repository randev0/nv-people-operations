/**
 * Dashboard "Today": compact header with the Office times control, KPI strip, "Needs
 * your attention" with one work list at a time (Assign requests / Onboarding
 * follow-ups), assigning from the side panel (single, stale and bulk), View all links,
 * the equipment line, the caught-up state, keyboard use and role access.
 */
import { test, expect, type Page } from "@playwright/test";

const PASSWORD = process.env.DEMO_PASSWORD ?? "PeopleOps-Demo-2026!";
const PRIORITY = ["Urgent", "High", "Medium", "Low"];

async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/dashboard");
}

const attention = (page: Page) => page.getByRole("region", { name: "Needs your attention" });
const panelRows = (page: Page) => attention(page).getByRole("tabpanel").getByRole("listitem");
const tab = (page: Page, name: string) => page.getByRole("tab", { name: new RegExp(`^${name} · \\d+$`) });
const tabCount = async (page: Page, name: string) => Number((await tab(page, name).innerText()).match(/(\d+)\s*$/)![1]);
const kpi = async (page: Page, label: string) => Number((await page.getByRole("link", { name: new RegExp(`^${label}`) }).first().innerText()).match(/(\d+)\s*$/)![1]);

test.describe.configure({ mode: "serial" });

test("HR: office times on demand; tabs with live counts; three rows each; keyboard; selected tab survives reload; View all", async ({ page }) => {
  await signIn(page, "hr.admin@example.com");
  // Office clocks are collapsed behind one control; Escape closes and returns focus.
  const clocks = page.getByRole("list", { name: "Local time in each office" });
  await expect(clocks).toHaveCount(0);
  const officeBtn = page.getByRole("button", { name: /^Office times/ });
  await officeBtn.click();
  await expect(clocks.getByRole("listitem")).toHaveCount(4);
  await expect(clocks).toContainText("Nicosia");
  await page.keyboard.press("Escape");
  await expect(clocks).toHaveCount(0);
  await expect(officeBtn).toBeFocused();

  // Counts come from the same rules as the figures.
  const unassigned = await kpi(page, "Unassigned");
  expect(await tabCount(page, "Assign requests")).toBe(unassigned);
  test.skip(unassigned === 0, "needs unassigned requests");
  await expect(tab(page, "Assign requests")).toHaveAttribute("aria-selected", "true");
  const ranks = (await panelRows(page).allInnerTexts()).map((t) => PRIORITY.findIndex((p) => t.startsWith(p)));
  expect(ranks.length).toBeLessThanOrEqual(3);
  expect(ranks.every((r) => r >= 0)).toBe(true);
  expect([...ranks].sort((a, b) => a - b)).toEqual(ranks);
  // Bulk controls stay hidden until Select.
  await expect(attention(page).getByRole("checkbox")).toHaveCount(0);

  // Keyboard: arrow to the next tab; the URL remembers it.
  await tab(page, "Assign requests").focus();
  await page.keyboard.press("ArrowRight");
  const follow = tab(page, "Onboarding follow-ups");
  await expect(follow).toBeFocused();
  await expect(follow).toHaveAttribute("aria-selected", "true");
  await expect(page).toHaveURL(/list=followups/);
  const followTotal = await tabCount(page, "Onboarding follow-ups");
  const days = (await panelRows(page).allInnerTexts()).map((t) => Number(t.match(/^(\d+) days? overdue/)![1]));
  expect(days.length).toBe(Math.min(3, followTotal));
  expect([...days].sort((a, b) => b - a)).toEqual(days);
  await expect(panelRows(page).first()).toContainText("Owner ");
  await expect(panelRows(page).first().getByRole("link", { name: /^Review task/ })).toBeVisible();
  await page.reload();
  await expect(tab(page, "Onboarding follow-ups")).toHaveAttribute("aria-selected", "true");

  // View all → the overdue list with exactly that many tasks.
  await attention(page).getByRole("link", { name: `View all ${followTotal} onboarding follow-ups` }).click();
  await expect(page).toHaveURL(/\/onboarding\/overdue\?owner=others/);
  await expect(page.getByRole("main").getByRole("listitem")).toHaveCount(followTotal);
  // Review task opens the task in its checklist.
  await page.goto("/dashboard?list=followups");
  await panelRows(page).first().getByRole("link", { name: /^Review task/ }).click();
  await expect(page).toHaveURL(/\/onboarding\/[0-9a-f-]+#task-/);

  // View all requests → the filtered request list, same number, same order rule.
  await page.goto("/dashboard?list=assign");
  await attention(page).getByRole("link", { name: `View all ${unassigned} requests to assign` }).click();
  await expect(page).toHaveURL(/status=SUBMITTED/);
  await expect(page).toHaveURL(/sort=priority/);
  await expect(page.getByText(`${unassigned} request${unassigned === 1 ? "" : "s"}`, { exact: true })).toBeVisible();
});

test("HR assigns from the side panel; confirmation, counts and the next row update in place", async ({ page }) => {
  await signIn(page, "hr.admin@example.com");
  const before = await kpi(page, "Unassigned");
  test.skip(before === 0, "needs an unassigned request");
  const first = panelRows(page).first();
  const title = (await first.getByRole("link").first().innerText()).trim();
  const trigger = first.getByRole("button", { name: /^Assign/ });
  await trigger.click();
  const sheet = page.getByRole("dialog", { name: title });
  await expect(sheet).toBeVisible();
  // The panel shows the request's description and context next to the picker.
  await expect(sheet.getByRole("link", { name: "Open the full record" })).toBeVisible();
  await expect(sheet).toContainText("From ");
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(trigger).toBeFocused();

  await trigger.click();
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
  await expect(page).toHaveURL(/\/dashboard/);
  await expect.poll(() => kpi(page, "Unassigned")).toBe(before - 1);
  await expect.poll(() => tabCount(page, "Assign requests")).toBe(before - 1);
  await expect(tab(page, "Assign requests")).toHaveAttribute("aria-selected", "true");
  await expect(panelRows(page).filter({ hasText: title })).toHaveCount(0);
  if (before - 1 >= 3) await expect(panelRows(page)).toHaveCount(3); // the next request moved up
});

test("a stale assignment is refused clearly and the panel shows who has it now", async ({ page }) => {
  await signIn(page, "hr.admin@example.com");
  test.skip((await kpi(page, "Unassigned")) === 0, "needs an unassigned request");
  const first = panelRows(page).first();
  const title = (await first.getByRole("link").first().innerText()).trim();
  const id = (await first.getByRole("link").first().getAttribute("href"))!.split("/").pop()!;
  await first.getByRole("button", { name: /^Assign/ }).click();
  const sheet = page.getByRole("dialog", { name: title });
  const select = sheet.getByLabel("Assign to");
  await expect(select).toBeEnabled();
  const value = (await select.locator("option").nth(1).getAttribute("value"))!;
  // Someone else assigns it while the panel is open.
  const status = await page.evaluate(async ({ id, value }) => {
    const r = await (await fetch(`/api/requests/${id}`)).json();
    const res = await fetch(`/api/requests/${id}/assign`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assigneeId: value, expectedVersion: r.data.version }) });
    return res.status;
  }, { id, value });
  expect(status).toBe(200);
  await select.selectOption(value);
  await sheet.getByRole("button", { name: "Assign", exact: true }).click();
  await expect(sheet.getByRole("alert").filter({ hasText: "Someone else already handled this request" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(panelRows(page).filter({ hasText: title })).toHaveCount(0);
});

test("HR bulk-assigns two requests after Select; selection count and bar appear only in selection mode", async ({ page }) => {
  await signIn(page, "hr.admin@example.com");
  const before = await kpi(page, "Unassigned");
  test.skip(before < 2, "needs two unassigned requests");
  await expect(page.getByRole("region", { name: "Bulk assign" })).toHaveCount(0);
  await attention(page).getByRole("button", { name: "Select", exact: true }).click();
  await expect(panelRows(page)).toHaveCount(before); // selection lists every assignable request
  await expect(attention(page).getByText(`0 of ${before} selected`)).toBeVisible();
  await panelRows(page).nth(0).getByRole("checkbox").check();
  await panelRows(page).nth(1).getByRole("checkbox").check();
  await expect(attention(page).getByText(`2 of ${before} selected`)).toBeVisible();
  const bar = page.getByRole("region", { name: "Bulk assign" });
  await expect(bar).toContainText("2 selected");
  const select = bar.getByLabel("Assign selected requests to");
  await expect(select).toBeEnabled();
  const option = select.locator("option").nth(1);
  const name = (await option.innerText()).replace(/ \([A-Z]{2}\)$/, "");
  await select.selectOption((await option.getAttribute("value"))!);
  await bar.getByRole("button", { name: "Assign 2" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Assigned 2 of 2 requests" })).toContainText(`to ${name}`);
  await expect(attention(page).getByRole("checkbox")).toHaveCount(0); // back to normal mode
  await expect.poll(() => kpi(page, "Unassigned")).toBe(before - 2);
  // Cancel leaves selection mode without assigning anything.
  if (before - 2 > 1) {
    await attention(page).getByRole("button", { name: "Select", exact: true }).click();
    await attention(page).getByRole("button", { name: "Cancel" }).click();
    await expect(attention(page).getByRole("checkbox")).toHaveCount(0);
  }
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
  await expect(page.getByRole("navigation", { name: "Dashboard views" })).toHaveCount(0); // no org reporting
  const rows = attention(page).getByRole("listitem");
  await expect(rows.first()).toBeVisible();
  expect(await rows.count()).toBeLessThanOrEqual(3);
  await expect(attention(page).getByRole("link", { name: /^View all \d+ in My Work/ })).toHaveAttribute("href", "/my-work");
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
      // allInnerTexts() does not wait: innerText() would block if the row vanished between calls.
      const labels = await rows.filter({ has: page.locator(`a[href="${href}"]`) }).getByRole("button").allInnerTexts();
      return labels.length === 0 ? "gone" : labels[0].trim();
    }, { timeout: 15_000, message: "row should leave the list or offer its next step after the refresh" })
    .not.toBe(before);
  const link = rows.first().getByRole("link").first();
  const next = (await link.innerText()).trim();
  await link.click();
  await expect(page).toHaveURL(/\/(requests|onboarding)\/[0-9a-f-]+/);
  await expect(page.getByText(next).first()).toBeVisible();
});

test("manager: team-only follow-ups and equipment line; Insights shows team reporting", async ({ page }) => {
  await signIn(page, "manager.my@example.com");
  await page.goto("/onboarding?progress=active");
  const teamNames = (await page.locator("table tbody tr td:first-child a").allInnerTexts()).map((t) => t.trim());
  await page.goto("/dashboard?list=followups");
  await expect(tab(page, "Onboarding follow-ups")).toHaveAttribute("aria-selected", "true");
  for (const t of await panelRows(page).allInnerTexts()) {
    expect(teamNames.some((n) => t.includes(n))).toBe(true);
  }
  const line = page.getByRole("region", { name: "IT equipment for new hires" });
  await expect(line).toContainText(/new hires? in your team (has|have)/);
  await line.getByRole("link", { name: "Review requests" }).click();
  await expect(page).toHaveURL(/scope=team&insight=new-hires-it/);

  await page.goto("/dashboard?tab=insights");
  await expect(page.getByRole("region", { name: "Overdue onboarding tasks" })).toContainText("in your team");
  const progress = page.getByRole("region", { name: "Onboarding progress" }).getByRole("listitem");
  for (const t of await progress.allInnerTexts()) expect(teamNames.some((n) => t.includes(n))).toBe(true);
  await expect(page.getByRole("region", { name: "Headcount by office" })).toHaveCount(0); // org reporting is HR's
});

test("nothing to act on: caught-up state with onward links; employees see no reporting, even via ?tab=insights", async ({ page }) => {
  await signIn(page, "employee.cy@example.com");
  await expect(page.getByText("You're all caught up.")).toBeVisible();
  await expect(attention(page).getByRole("link", { name: "Requests", exact: true })).toHaveAttribute("href", "/requests");
  await expect(attention(page).getByRole("link", { name: "Onboarding" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Dashboard views" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /^My open requests/ })).toBeVisible();
  await page.goto("/dashboard?tab=insights");
  await expect(page.getByText("You're all caught up.")).toBeVisible();
  await expect(page.getByRole("region", { name: "Open requests by status" })).toHaveCount(0);
});
