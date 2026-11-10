/**
 * Regression tests for the 2026-11-10 exploratory findings (docs/QA_FINDINGS.md).
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { BASE, Client, db, login, userId } from "./helpers";

after(() => db.$disconnect());

const catId = async (code: string) => (await db.requestCategory.findUniqueOrThrow({ where: { code } })).id;
const deptId = async (name: string) => (await db.department.findUniqueOrThrow({ where: { name } })).id;

test("L9: only the category's own team can be assigned; options list only that team", async () => {
  const emp = await login("employee.my@example.com");
  const r = await emp.post("/requests", { title: "Broken chair in room 4", description: "The chair at desk 4 is broken and wobbles.", categoryId: await catId("FACILITIES"), priority: "LOW" });
  const hr = await login("hr.admin@example.com");
  const opts = await hr.get(`/requests/${r.json.data.id}/assignee-options`);
  const fac = await deptId("Facilities");
  assert.ok(opts.json.data.length > 0);
  assert.ok(opts.json.data.every((o: { department: { id: string } }) => o.department.id === fac), "only Facilities people offered");
  const marketing = await db.user.findFirstOrThrow({ where: { department: { name: "Marketing" }, loginEnabled: true } });
  const bad = await hr.post(`/requests/${r.json.data.id}/assign`, { assigneeId: marketing.id, expectedVersion: 1 });
  assert.equal(bad.status, 422);
  assert.match(bad.json.error.message, /team that handles/);
});

test("H2: a rate-limited Refresh keeps the previous good suggestion", async () => {
  const req = await db.serviceRequest.findFirstOrThrow({ where: { status: "SUBMITTED" } });
  await db.requestAiSuggestion.upsert({
    where: { requestId: req.id },
    create: { requestId: req.id, status: "READY", explanation: "kept", categoryId: req.categoryId, priority: "LOW", suggestedDepartmentId: await deptId("IT") },
    update: { status: "READY", explanation: "kept", failureReason: null, categoryId: req.categoryId, priority: "LOW", suggestedDepartmentId: await deptId("IT") },
  });
  const hr = await login("hr.admin@example.com");
  // Use up the per-minute AI budget, then refresh.
  await db.$executeRaw`INSERT INTO "AiUsageBucket" ("userId", "windowStart", "count") VALUES (${await userId("hr.admin@example.com")}::uuid, date_trunc('minute', now()), 999)
    ON CONFLICT ("userId", "windowStart") DO UPDATE SET "count" = 999`;
  const r = await hr.post(`/requests/${req.id}/ai-suggestion`);
  assert.equal(r.status, 503);
  assert.match(r.json.error.message, /previous suggestion is kept/);
  const s = await db.requestAiSuggestion.findUniqueOrThrow({ where: { requestId: req.id } });
  assert.equal(s.status, "READY");
  assert.equal(s.explanation, "kept");
});

test("M2: disabling someone with open work requires a hand-over, which moves requests and tasks", async () => {
  const hr = await login("hr.admin@example.com");
  const it = await db.user.findUniqueOrThrow({ where: { email: "it.owner@example.com" } });
  const openReq = await db.serviceRequest.count({ where: { assigneeId: it.id, status: { in: ["ASSIGNED", "IN_PROGRESS"] } } });
  const openTasks = await db.onboardingTask.count({ where: { ownerId: it.id, status: { not: "COMPLETED" } } });
  assert.ok(openReq + openTasks > 0, "fixture: it.owner has open work");
  const refused = await hr.patch(`/employees/${it.id}`, { loginEnabled: false });
  assert.equal(refused.status, 422);
  assert.equal(refused.json.error.code, "OPEN_WORK");
  const wrongTeam = await db.user.findFirstOrThrow({ where: { department: { name: "Finance" }, loginEnabled: true } });
  assert.equal((await hr.patch(`/employees/${it.id}`, { loginEnabled: false, handOverToId: wrongTeam.id })).status, 422, "successor must be in the same team");
  const colleague = await db.user.findFirstOrThrow({ where: { departmentId: it.departmentId, loginEnabled: true, id: { not: it.id }, countryCode: "MY" } });
  const ok = await hr.patch(`/employees/${it.id}`, { loginEnabled: false, handOverToId: colleague.id });
  assert.equal(ok.status, 200, JSON.stringify(ok.json));
  assert.equal(await db.serviceRequest.count({ where: { assigneeId: it.id, status: { in: ["ASSIGNED", "IN_PROGRESS"] } } }), 0);
  assert.equal(await db.onboardingTask.count({ where: { ownerId: it.id, status: { not: "COMPLETED" } } }), 0);
  assert.ok((await db.requestEvent.count({ where: { kind: "REASSIGNED", previousAssigneeId: it.id, newAssigneeId: colleague.id } })) >= openReq);
  // Restore for later tests.
  await db.user.update({ where: { id: it.id }, data: { loginEnabled: true } });
});

test("M4/M8: closed requests refuse comments; out-of-order transitions say what happened in words", async () => {
  const closed = await db.serviceRequest.findFirstOrThrow({ where: { status: "CLOSED" }, include: { requester: true } });
  const owner = await login(closed.requester.email);
  const c = await owner.post(`/requests/${closed.id}/comments`, { body: "Still broken?" });
  assert.equal(c.status, 422);
  assert.equal(c.json.error.code, "REQUEST_CLOSED");
  const t = await owner.post(`/requests/${closed.id}/transition`, { action: "CLOSE", expectedVersion: closed.version });
  assert.equal(t.status, 422);
  assert.equal(t.json.error.message, "This request is already closed.");
});

test("M6/M7/M1: duplicate template names and absurd joining dates are refused with plain messages", async () => {
  const hr = await login("hr.admin@example.com");
  const tpl = await db.onboardingTemplate.findFirstOrThrow();
  const dup = await hr.post("/onboarding-templates", { name: tpl.name.toUpperCase(), description: "", tasks: [{ key: "a", title: "Only task", description: "", departmentId: await deptId("IT"), dueDay: 1, prerequisiteKeys: [], sortOrder: 0 }] });
  assert.equal(dup.status, 422);
  assert.equal(dup.json.error.code, "DUPLICATE");
  const future = await hr.post("/employees", { name: "Future Person", email: "future.person@example.com", initialPassword: "integration-pass-123", role: "EMPLOYEE", countryCode: "MY", departmentId: await deptId("IT"), managerId: null, joiningDate: "2099-12-31", employmentStatus: "ACTIVE" });
  assert.equal(future.status, 400);
  assert.match(future.json.error.fieldErrors.joiningDate[0], /between 1970 and one year from today/);
  const empty = await hr.post("/requests", { title: "", description: "short", categoryId: await catId("OTHER"), priority: "LOW" });
  assert.equal(empty.json.error.message, "Some fields need attention.");
  assert.equal(empty.json.error.fieldErrors.title[0], "Needs at least 3 characters.");
  assert.equal(empty.json.error.fieldErrors.description[0], "Needs at least 10 characters.");
});

test("E2/M10: unknown API paths answer JSON 404; the lock-out message says how long", async () => {
  const anon = new Client();
  const nf = await anon.get("/definitely-not-here");
  assert.equal(nf.status, 404);
  assert.equal(nf.json.error.code, "NOT_FOUND");
  let last = { status: 0, json: null as unknown as { error: { message: string } } };
  for (let i = 0; i < 12; i++) last = await anon.post("/auth/login", { email: "employee.cy@example.com", password: `wrong-${i}` });
  assert.equal(last.status, 429);
  assert.match(last.json.error.message, /Try again in \d+ minutes?/);
  await db.loginThrottle.deleteMany({});
  assert.ok(BASE);
});

test("AI global cap: once the hourly ceiling across all users is spent, a fresh user is refused too", async () => {
  const other = await db.user.findFirstOrThrow({ where: { role: "EMPLOYEE", loginEnabled: true, countryCode: "BD" } });
  await db.aiUsageBucket.deleteMany({}); // earlier tests (H2) also fill buckets
  // Simulate heavy use by one shared account in the last hour (limit 500/h in tests).
  await db.$executeRaw`INSERT INTO "AiUsageBucket" ("userId", "windowStart", "count") VALUES (${other.id}::uuid, date_trunc('minute', now()) - interval '10 minutes', 600)
    ON CONFLICT ("userId", "windowStart") DO UPDATE SET "count" = 600`;
  const mgr = await login("manager.my@example.com");
  const r = await mgr.post("/ai/route-request", { title: "Laptop broken", description: "My laptop does not boot after the update." });
  assert.equal(r.status, 429);
  await db.aiUsageBucket.deleteMany({ where: { userId: other.id } });
  const again = await mgr.post("/ai/route-request", { title: "Laptop broken", description: "My laptop does not boot after the update." });
  assert.equal(again.status, 200, "budget returns when the ceiling has room");
});
