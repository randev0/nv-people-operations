import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const PASSWORD = process.env.DEMO_PASSWORD!;

async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/dashboard");
}

const focused = (page: Page) =>
  page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el) return "";
    const label = el.id ? document.querySelector(`label[for="${el.id}"]`)?.textContent : null;
    return (label || el.getAttribute("aria-label") || el.textContent || el.tagName).trim();
  });

async function tabTo(page: Page, name: RegExp, max = 40) {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press("Tab");
    if (name.test(await focused(page))) return;
  }
  throw new Error(`could not reach ${name} with Tab`);
}

test("keyboard only: sign in, skip link, submit a request", async ({ page }) => {
  await page.goto("/login");
  await tabTo(page, /^Email$/);
  await page.keyboard.type("employee.my@example.com");
  await page.keyboard.press("Tab");
  expect(await focused(page)).toBe("Password");
  await page.keyboard.type(PASSWORD);
  await page.keyboard.press("Enter");
  await page.waitForURL("**/dashboard");

  // First Tab on an app page reveals the skip link.
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to content" });
  await expect(skip).toBeFocused();
  await expect(skip).toBeVisible();

  await page.goto("/requests/new");
  await tabTo(page, /^Title$/);
  await page.keyboard.type("Keyboard-only request");
  await page.keyboard.press("Tab");
  expect(await focused(page)).toBe("Description");
  await page.keyboard.type("Submitted without touching the mouse to check keyboard access.");
  await page.keyboard.press("Tab");
  expect(await focused(page)).toBe("Category");
  await page.keyboard.press("ArrowDown"); // first real category
  await page.keyboard.press("Tab");
  expect(await focused(page)).toBe("Priority");
  await page.keyboard.press("Tab");
  expect(await focused(page)).toMatch(/Submit request/);
  // Visible focus indicator on the focused button.
  const ring = await page.evaluate(() => {
    const s = getComputedStyle(document.activeElement as Element);
    return s.outlineStyle !== "none" || s.boxShadow !== "none";
  });
  expect(ring).toBe(true);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: /Keyboard-only request/ })).toBeVisible();
});

test("keyboard only: dialog traps focus and Escape returns focus to the trigger", async ({ page }) => {
  await signIn(page, "hr.admin@example.com");
  await page.goto("/employees");
  const trigger = page.getByRole("button", { name: "New employee" });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "New employee" });
  await expect(dialog).toBeVisible();
  for (let i = 0; i < 25; i++) {
    await page.keyboard.press("Tab");
    expect(await dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

const PAGES: { who: string; paths: string[] }[] = [
  { who: "employee.my@example.com", paths: ["/dashboard", "/requests", "/requests/new", "/my-work", "/onboarding"] },
  { who: "manager.my@example.com", paths: ["/dashboard", "/dashboard?tab=insights", "/requests?scope=team", "/onboarding", "/employees"] },
  { who: "hr.admin@example.com", paths: ["/dashboard", "/dashboard?tab=insights", "/dashboard?queue=all", "/onboarding/overdue", "/requests?scope=all", "/templates", "/onboarding/assign", "/employees"] },
];

test("automated accessibility scan (axe, WCAG 2.1 A/AA): no serious or critical violations", async ({ page }) => {
  test.setTimeout(120_000); // 20 pages × sign-in + scan
  const report: string[] = [];
  const scanned: string[] = ["/login"];
  await page.goto("/login");
  const login = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  for (const v of login.violations) report.push(`/login ${v.impact} ${v.id}: ${v.nodes.length} node(s)`);
  for (const { who, paths } of PAGES) {
    await signIn(page, who);
    // include one detail page per role
    const extra: string[] = [];
    const firstReq = await page.evaluate(async () => (await (await fetch("/api/requests?pageSize=1&scope=mine")).json()).data?.[0]?.id);
    if (firstReq) extra.push(`/requests/${firstReq}`);
    for (const path of [...paths, ...extra]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      expect(page.url(), "scan must run on the authenticated page, not a redirect").toContain(path.split("?")[0]);
      scanned.push(`${path} (${who})`);
      const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
      for (const v of r.violations) report.push(`${path} (${who}) ${v.impact} ${v.id}: ${v.nodes.length} node(s) — ${v.nodes[0]?.target.join(" ")}`);
    }
    await page.context().clearCookies();
  }
  console.log(`axe scanned ${scanned.length} pages`);
  console.log(report.length ? report.join("\n") : "axe: no violations");
  expect(scanned.length).toBeGreaterThanOrEqual(20);
  expect(report.filter((l) => / (serious|critical) /.test(l))).toEqual([]);
});
