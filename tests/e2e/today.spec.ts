/**
 * Dashboard "Today" tab: prioritised work queue, actions with feedback, the compact
 * insight, the caught-up state, keyboard use and the Insights tab hand-off.
 */
import { test, expect, type Page } from "@playwright/test";

const PASSWORD = process.env.DEMO_PASSWORD ?? "PeopleOps-Demo-2026!";
const TIERS = ["Overdue", "Blocking others", "High priority", "Due soon", "Waiting on you", "Upcoming", "Confirm fix"];

async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/dashboard");
}

const work = (page: Page) => page.getByRole("region", { name: /Your next steps|All your work/ });

test.describe.configure({ mode: "serial" });

test("Today opens by default, shows at most three items in rule order, and View all shows the rest in the same order", async ({ page }) => {
  await signIn(page, "it.owner@example.com");
  await expect(page.getByRole("link", { name: "Today" })).toHaveAttribute("aria-current", "page");
  const rows = work(page).getByRole("listitem");
  const visible = await rows.count();
  expect(visible).toBeGreaterThan(0);
  expect(visible).toBeLessThanOrEqual(3);
  const top = await rows.allInnerTexts();

  await page.getByRole("link", { name: /^View all \d+/ }).click();
  await expect(page).toHaveURL(/queue=all/);
  const all = await work(page).getByRole("listitem").allInnerTexts();
  expect(all.length).toBeGreaterThan(visible);
  expect(all.slice(0, visible)).toEqual(top); // the first three are the top of the full queue
  // Tier labels never go back up the priority list, and no record appears twice.
  const tierIdx = all.map((t) => TIERS.findIndex((l) => t.startsWith(l)));
  expect(tierIdx.every((i) => i >= 0)).toBe(true);
  expect([...tierIdx].sort((a, b) => a - b)).toEqual(tierIdx);
  const hrefs = await work(page).getByRole("listitem").evaluateAll((lis) => lis.map((li) => li.querySelector("a")!.getAttribute("href")));
  expect(new Set(hrefs).size).toBe(hrefs.length);
  // Each row explains its basis and names the affected person.
  for (const t of all) expect(t).toMatch(/·/);
});

test("acting on a work item confirms the change and refreshes the list", async ({ page }) => {
  await signIn(page, "it.owner@example.com");
  const first = work(page).getByRole("listitem").first();
  const title = (await first.getByRole("link").first().textContent())!.trim();
  const button = first.getByRole("button");
  const before = (await button.textContent())!;
  await button.click();
  const status = page.getByRole("status");
  await expect(status).toContainText(`“${title}”`);
  await expect(status).toContainText("Your list has been updated.");
  // The record either left the list or now offers its next step.
  await expect
    .poll(async () => {
      const row = work(page).getByRole("listitem").filter({ hasText: title });
      return (await row.count()) === 0 ? "gone" : (await row.getByRole("button").textContent())!;
    })
    .not.toBe(before);
  // The row title opens the record page.
  const next = work(page).getByRole("listitem").first().getByRole("link").first();
  const nextTitle = (await next.textContent())!.trim();
  await next.click();
  await expect(page).toHaveURL(/\/(requests|onboarding)\/[0-9a-f-]+/);
  await expect(page.getByText(nextTitle).first()).toBeVisible();
});

test("HR Today: assignment work and a compact equipment insight that counts hires and requests", async ({ page }) => {
  await signIn(page, "hr.admin@example.com");
  const rows = work(page).getByRole("listitem");
  await expect(rows.first()).toBeVisible();
  await expect(rows.first().getByRole("link", { name: /^Assign/ })).toBeVisible();
  const insight = page.getByRole("region", { name: "IT equipment for new hires" });
  const text = (await insight.innerText()).replace(/\s+/g, " ");
  const m = text.match(/(\d+) (?:person|people) who joined in the last 60 days (?:has|have) (\d+) open IT equipment requests?/);
  expect(m).not.toBeNull();
  expect(text).not.toMatch(/block/i);
  await insight.getByRole("link", { name: "Review requests" }).click();
  await expect(page).toHaveURL(/insight=new-hires-it/);
  await expect(page.getByText(`${m![2]} request${m![2] === "1" ? "" : "s"}`, { exact: true })).toBeVisible();
});

test("an account with nothing to act on sees the caught-up state with links onward", async ({ page }) => {
  await signIn(page, "employee.cy@example.com");
  await expect(page.getByText("You're all caught up.")).toBeVisible();
  await expect(work(page).getByRole("link", { name: "Requests", exact: true })).toHaveAttribute("href", "/requests");
  await expect(work(page).getByRole("link", { name: "Onboarding" })).toBeVisible();
});

test("keyboard: tabs, office times and the Insights tab", async ({ page }) => {
  await signIn(page, "manager.my@example.com");
  const officeTimes = page.getByText("Office times");
  await officeTimes.focus();
  await page.keyboard.press("Enter");
  const clocks = page.getByRole("list", { name: "Local time in each office" });
  await expect(clocks).toBeVisible();
  await expect(clocks.getByRole("listitem")).toHaveCount(4);
  await expect(clocks).toContainText("Nicosia");
  await page.keyboard.press("Enter");
  await expect(clocks).toBeHidden();
  const insights = page.getByRole("link", { name: "Insights" });
  await insights.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/tab=insights/);
  await expect(page.getByRole("link", { name: "Insights" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByText("Team open requests")).toBeVisible();
});
