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

test("AI02/AI04: provider failure → 503 with nothing written, invalid output → 503, then 429 at the rate limit; manual submit still works", async () => {
  const c = await login("hr.ops@example.com"); // fresh AI budget (no other test uses this account)
  const before = await db.serviceRequest.count();
  const fail = { title: "[ai-fail] Laptop broken", description: "My laptop does not boot after the update." };
  const invalid = { title: "[ai-invalid] Laptop broken", description: "My laptop does not boot after the update." };
  const r1 = await c.post("/ai/route-request", fail);
  assert.equal(r1.status, 503);
  assert.equal(r1.json.error.code, "AI_UNAVAILABLE");
  const r2 = await c.post("/ai/route-request", invalid);
  assert.equal(r2.status, 503);
  assert.equal(r2.json.error.code, "AI_INVALID_OUTPUT");
  const r3 = await c.post("/ai/route-request", { title: "Laptop broken", description: "My laptop does not boot after the update." });
  assert.equal(r3.status, 200);
  assert.equal(r3.json.data.needsReview, true);
  assert.deepEqual([(await c.post("/ai/route-request", fail)).status, (await c.post("/ai/route-request", fail)).status], [429, 429]); // limit 3/min in tests
  assert.equal(await db.serviceRequest.count(), before, "suggestions never create or change requests");
  const cat = await db.requestCategory.findUniqueOrThrow({ where: { code: "IT_EQUIPMENT" } });
  assert.equal((await c.post("/requests", { ...fail, categoryId: cat.id, priority: "HIGH" })).status, 201);
});

async function waitForSuggestion(c: Awaited<ReturnType<typeof login>>, id: string) {
  for (let i = 0; i < 40; i++) {
    const r = await c.get(`/requests/${id}/ai-suggestion`);
    if (r.json.data.status !== "PENDING" && r.json.data.status !== "NONE") return r.json.data;
    await new Promise((res) => setTimeout(res, 250));
  }
  throw new Error("suggestion never finished");
}

test("stored suggestion: generated after submit, person shown only to assigners, request never changed", async () => {
  const emp = await login("employee.my@example.com");
  const cat = await db.requestCategory.findUniqueOrThrow({ where: { code: "OTHER" } });
  const created = await emp.post("/requests", { title: "Laptop screen flickers", description: "My laptop screen flickers constantly and I cannot read documents.", categoryId: cat.id, priority: "LOW" });
  assert.equal(created.status, 201);
  const id = created.json.data.id;

  const asRequester = await waitForSuggestion(emp, id);
  assert.equal(asRequester.status, "READY");
  assert.equal(asRequester.category.code, "IT_EQUIPMENT");
  assert.equal(asRequester.priority, "HIGH");
  assert.equal(asRequester.suggestedAssignee, null, "requester does not see the suggested person");
  assert.equal(asRequester.canRegenerate, false);

  const mgr = await login("manager.my@example.com");
  const asManager = (await mgr.get(`/requests/${id}/ai-suggestion`)).json.data;
  assert.ok(asManager.suggestedAssignee, "assigner sees the suggested person");
  assert.equal(asManager.suggestedAssignee.department.id, asManager.suggestedDepartment.id);
  assert.equal(asManager.canRegenerate, true);

  const row = await db.serviceRequest.findUniqueOrThrow({ where: { id } });
  assert.equal(row.status, "SUBMITTED");
  assert.equal(row.assigneeId, null);
  assert.equal(row.categoryId, cat.id, "AI never rewrites the submitted category");
  assert.equal(row.version, 1);

  const cy = await login("employee.cy@example.com");
  assert.equal((await cy.get(`/requests/${id}/ai-suggestion`)).status, 404);
  assert.equal((await emp.post(`/requests/${id}/ai-suggestion`)).status, 403, "requester cannot regenerate");
  const regen = await mgr.post(`/requests/${id}/ai-suggestion`);
  assert.equal(regen.status, 200);
  assert.equal(regen.json.data.status, "READY");

  // The manager can then assign the suggested person through the normal, authorised path.
  const a = await mgr.post(`/requests/${id}/assign`, { assigneeId: asManager.suggestedAssignee.id, expectedVersion: 1 });
  assert.equal(a.status, 200);
  assert.equal(a.json.data.assignee.id, asManager.suggestedAssignee.id);
});

test("stored suggestion: provider failure is recorded, request still usable", async () => {
  const emp = await login("employee.cy@example.com");
  const cat = await db.requestCategory.findUniqueOrThrow({ where: { code: "FACILITIES" } });
  const created = await emp.post("/requests", { title: "[ai-fail] Broken chair", description: "The chair at my desk is broken.", categoryId: cat.id, priority: "LOW" });
  const s = await waitForSuggestion(emp, created.json.data.id);
  assert.equal(s.status, "FAILED");
  assert.match(s.failureReason, /unavailable/);
  assert.equal((await emp.get(`/requests/${created.json.data.id}`)).json.data.status, "SUBMITTED");
});

test("AI02 timeout: a provider that never answers → 503 within the app's timeout; stored suggestion FAILED; request usable", async () => {
  const c = await login("it.owner@example.com"); // fresh AI budget
  const started = Date.now();
  const r = await c.post("/ai/route-request", { title: "[ai-slow] Printer jammed", description: "The level 3 printer jams on every page." });
  const ms = Date.now() - started;
  assert.equal(r.status, 503);
  assert.equal(r.json.error.code, "AI_UNAVAILABLE");
  assert.ok(ms < 8000, `gave up after ${ms} ms (app timeout 2 s in tests, provider would take 10 s)`);

  const cat = await db.requestCategory.findUniqueOrThrow({ where: { code: "FACILITIES" } });
  const created = await c.post("/requests", { title: "[ai-slow] Printer jammed", description: "The level 3 printer jams on every page.", categoryId: cat.id, priority: "MEDIUM" });
  assert.equal(created.status, 201, "submission never waits on the AI");
  const s = await waitForSuggestion(c, created.json.data.id);
  assert.equal(s.status, "FAILED");
  assert.match(s.failureReason, /did not answer in time/);
});
