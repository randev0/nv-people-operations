import { test, after } from "node:test";
import assert from "node:assert/strict";
import { db, login, userId } from "./helpers";
import { formatDateOnly, isOverdue } from "../../src/server/onboarding/dates";

after(() => db.$disconnect());

test("D02: headcount comes from the database, 25 per country", async () => {
  const hr = await login("hr.admin@example.com");
  const d = await hr.get("/dashboard");
  assert.equal(d.status, 200);
  const byCountry = Object.fromEntries(d.json.data.headcountByCountry.map((c: { countryCode: string; count: number }) => [c.countryCode, c.count]));
  const db100 = await db.user.groupBy({ by: ["countryCode"], _count: { _all: true } });
  for (const row of db100) assert.equal(byCountry[row.countryCode], row._count._all);
  assert.ok(["BD", "MY", "LK", "CY"].every((c) => byCountry[c] >= 25));
});

test("D03: resolving a request and completing an overdue task move the dashboard and detail totals together", async () => {
  const hr = await login("hr.admin@example.com");
  const before = (await hr.get("/dashboard")).json.data;
  // An in-progress request assigned to it.owner
  const itId = await userId("it.owner@example.com");
  const req = await db.serviceRequest.findFirstOrThrow({ where: { assigneeId: itId, status: "IN_PROGRESS" } });
  const it = await login("it.owner@example.com");
  assert.equal((await it.post(`/requests/${req.id}/transition`, { action: "RESOLVE", expectedVersion: req.version })).status, 200);
  // An overdue in-progress task owned by someone: complete it as its owner.
  // Avoid employee.my's checklist: the onboarding test relies on its "account" task staying in progress.
  const tasks = await db.onboardingTask.findMany({
    where: { status: "IN_PROGRESS", onboarding: { employee: { email: { not: "employee.my@example.com" } } } },
    include: { onboarding: true, owner: true },
    orderBy: { id: "asc" },
  });
  const overdue = tasks.find((t) => isOverdue({ status: t.status, dueDate: formatDateOnly(t.dueDate) }, t.onboarding.timezone))!;
  assert.ok(overdue, "seed has an overdue in-progress task");
  const owner = await login(overdue.owner.email);
  assert.equal((await owner.post(`/onboarding-tasks/${overdue.id}/transition`, { action: "COMPLETE", expectedVersion: overdue.version })).status, 200);

  const afterD = (await hr.get("/dashboard")).json.data;
  assert.equal(afterD.openRequests.total, before.openRequests.total - 1);
  assert.equal(afterD.onboarding.overdueTasks, before.onboarding.overdueTasks - 1);
  const ip = (s: { byStatus: { status: string; count: number }[] }) => s.byStatus.find((x) => x.status === "IN_PROGRESS")!.count;
  assert.equal(ip(afterD.openRequests), ip(before.openRequests) - 1);
  // Detail view reports the same overdue flag function.
  const detail = (await hr.get(`/onboarding/${overdue.onboardingId}`)).json.data;
  assert.equal(detail.tasks.find((t: { id: string }) => t.id === overdue.id).isOverdue, false);
  const listed = await hr.get("/onboarding?pageSize=100");
  const sumOverdue = listed.json.data.filter((o: { completedAt: string | null }) => !o.completedAt).reduce((n: number, o: { progress: { overdue: number } }) => n + o.progress.overdue, 0);
  assert.equal(sumOverdue, afterD.onboarding.overdueTasks, "list progress and dashboard agree");
});

test("D04: cross-module insight lists recent hires with links to their actual open IT requests", async () => {
  const hr = await login("hr.admin@example.com");
  const d = (await hr.get("/dashboard")).json.data;
  assert.ok(d.newHiresWithOpenITRequests.length >= 3);
  for (const h of d.newHiresWithOpenITRequests) {
    for (const id of h.requestIds) {
      const r = await db.serviceRequest.findUniqueOrThrow({ where: { id }, include: { category: true } });
      assert.equal(r.requesterId, h.employeeId);
      assert.equal(r.category.code, "IT_EQUIPMENT");
      assert.ok(["SUBMITTED", "ASSIGNED", "IN_PROGRESS"].includes(r.status));
    }
  }
});

test("personal dashboard is scoped; manager gets direct-report team totals only", async () => {
  const mgr = await login("manager.my@example.com");
  const m = await mgr.get("/dashboard/mine");
  assert.equal(m.status, 200);
  const mgrId = await userId("manager.my@example.com");
  assert.equal(m.json.data.team.directReports, await db.user.count({ where: { managerId: mgrId } }));
  const emp = await login("employee.cy@example.com");
  assert.equal((await emp.get("/dashboard/mine")).json.data.team, undefined);
});

test("AI02/AI04: without a provider key the router returns 503 (draft untouched, nothing written), then 429 at the rate limit", async () => {
  const c = await login("employee.my@example.com");
  const before = await db.serviceRequest.count();
  const body = { title: "Laptop broken", description: "My laptop does not boot after the update." };
  const statuses: number[] = [];
  for (let i = 0; i < 5; i++) statuses.push((await c.post("/ai/route-request", body)).status);
  assert.deepEqual(statuses, [503, 503, 503, 429, 429]); // AI_RATE_LIMIT_PER_MINUTE=3 in the test runner
  assert.equal(await db.serviceRequest.count(), before);
  const invalid = await c.post("/ai/route-request", { title: "", description: "" });
  assert.ok([400, 429].includes(invalid.status));
  // Manual submission still works.
  const cat = await db.requestCategory.findUniqueOrThrow({ where: { code: "IT_EQUIPMENT" } });
  assert.equal((await c.post("/requests", { ...body, categoryId: cat.id, priority: "HIGH" })).status, 201);
});
