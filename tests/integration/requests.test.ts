import { test, after } from "node:test";
import assert from "node:assert/strict";
import { db, login, userId } from "./helpers";

after(() => db.$disconnect());

const catId = async (code: string) => (await db.requestCategory.findUniqueOrThrow({ where: { code } })).id;

async function newRequest(email: string, title = "Integration test request") {
  const c = await login(email);
  const r = await c.post("/requests", { title, description: "Created by the integration test suite.", categoryId: await catId("IT_EQUIPMENT"), priority: "MEDIUM" });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  return { client: c, request: r.json.data };
}

test("A03: employee guessing another employee's request, comments and events gets 404 and inserts nothing", async () => {
  const { request } = await newRequest("employee.my@example.com", "Private request of employee.my");
  const other = await login("employee.cy@example.com");
  const before = await db.requestComment.count({ where: { requestId: request.id } });
  for (const p of [`/requests/${request.id}`, `/requests/${request.id}/comments`, `/requests/${request.id}/events`]) {
    const r = await other.get(p);
    assert.equal(r.status, 404, p);
    assert.equal(JSON.stringify(r.json).includes("Private request"), false);
  }
  assert.equal((await other.post(`/requests/${request.id}/comments`, { body: "sneaky" })).status, 404);
  assert.equal((await other.post(`/requests/${request.id}/transition`, { action: "CLOSE", expectedVersion: 1 })).status, 404);
  assert.equal(await db.requestComment.count({ where: { requestId: request.id } }), before);
  const list = await other.get("/requests?scope=mine&pageSize=100");
  assert.ok(list.json.data.every((r: { id: string }) => r.id !== request.id));
});

test("A04: manager cannot read or assign a non-direct-report's request; same department/country grants nothing", async () => {
  // A Malaysian Finance-team employee's request: not a report of manager.my (Engineering).
  const mgrId = await userId("manager.my@example.com");
  const outsider = await db.user.findFirstOrThrow({ where: { countryCode: "MY", role: "EMPLOYEE", managerId: { not: mgrId }, loginEnabled: true } });
  const sameDept = await db.user.findFirstOrThrow({ where: { role: "EMPLOYEE", managerId: { not: mgrId }, department: { name: "Engineering" }, loginEnabled: true } });
  const mgr = await login("manager.my@example.com");
  for (const requester of [outsider, sameDept]) {
    const req = await db.serviceRequest.create({
      data: { title: "Not your team", description: "x".repeat(20), categoryId: await catId("OTHER"), priority: "LOW", requesterId: requester.id },
    });
    assert.equal((await mgr.get(`/requests/${req.id}`)).status, 404);
    assert.equal((await mgr.post(`/requests/${req.id}/assign`, { assigneeId: mgrId, expectedVersion: 1 })).status, 404);
  }
  const outsiderOnb = await db.onboarding.findFirst({ where: { employee: { managerId: { not: mgrId } } } });
  if (outsiderOnb) assert.equal((await mgr.get(`/onboarding/${outsiderOnb.id}`)).status, 404);
});

test("A06: create payload cannot set status, assignee or requester", async () => {
  const c = await login("employee.my@example.com");
  const base = { title: "Escalation attempt", description: "Trying to set protected fields.", categoryId: await catId("OTHER"), priority: "LOW" };
  for (const extra of [{ status: "CLOSED" }, { assigneeId: await userId("it.owner@example.com") }, { requesterId: await userId("hr.admin@example.com") }]) {
    const r = await c.post("/requests", { ...base, ...extra });
    assert.equal(r.status, 400, JSON.stringify(extra));
  }
  assert.equal(await db.serviceRequest.count({ where: { title: "Escalation attempt" } }), 0);
});

test("A05/A07/A08: full lifecycle with assignee outside the team; invalid actors and skips are denied without history", async () => {
  const { client: requester, request } = await newRequest("employee.my@example.com", "Lifecycle request");
  const mgr = await login("manager.my@example.com");
  const it = await login("it.owner@example.com");
  const hr = await login("hr.admin@example.com");
  const itId = await userId("it.owner@example.com");
  const events = () => db.requestEvent.count({ where: { requestId: request.id } });

  // Skip SUBMITTED -> CLOSED / START denied; no events written.
  assert.equal((await requester.post(`/requests/${request.id}/transition`, { action: "CLOSE", expectedVersion: 1 })).status, 422);
  assert.equal((await it.post(`/requests/${request.id}/transition`, { action: "START", expectedVersion: 1 })).status, 404, "not yet visible to it.owner");
  // Requester cannot assign their own request; employee role cannot assign at all.
  assert.equal((await requester.post(`/requests/${request.id}/assign`, { assigneeId: itId, expectedVersion: 1 })).status, 403);
  assert.equal(await events(), 1);

  // Direct manager assigns to it.owner (not in the requester's team).
  const a = await mgr.post(`/requests/${request.id}/assign`, { assigneeId: itId, expectedVersion: 1 });
  assert.equal(a.status, 200, JSON.stringify(a.json));
  assert.equal(a.json.data.status, "ASSIGNED");

  // A05: assignee can now read and comment on this request only.
  assert.equal((await it.get(`/requests/${request.id}`)).status, 200);
  assert.equal((await it.post(`/requests/${request.id}/comments`, { body: "On it." })).status, 201);
  const unrelated = await db.serviceRequest.findFirstOrThrow({ where: { requester: { email: "employee.cy@example.com" }, assigneeId: { not: itId } } });
  assert.equal((await it.get(`/requests/${unrelated.id}`)).status, 404);

  // A07: non-assignees (requester, manager, HR) cannot start.
  for (const c of [requester, mgr, hr]) {
    assert.equal((await c.post(`/requests/${request.id}/transition`, { action: "START", expectedVersion: 2 })).status, 403);
  }
  assert.equal(await events(), 2);

  // A08: start -> resolve -> close with correct actors.
  const s = await it.post(`/requests/${request.id}/transition`, { action: "START", expectedVersion: 2 });
  assert.equal(s.json.data.status, "IN_PROGRESS");
  assert.equal((await mgr.post(`/requests/${request.id}/assign`, { assigneeId: await userId("hr.admin@example.com"), expectedVersion: 3 })).status, 422, "no reassignment after start");
  const rs = await it.post(`/requests/${request.id}/transition`, { action: "RESOLVE", expectedVersion: 3 });
  assert.equal(rs.json.data.status, "RESOLVED");
  assert.ok(rs.json.data.resolvedAt);
  assert.equal((await it.post(`/requests/${request.id}/transition`, { action: "CLOSE", expectedVersion: 4 })).status, 403, "assignee cannot close");
  const cl = await requester.post(`/requests/${request.id}/transition`, { action: "CLOSE", expectedVersion: 4 });
  assert.equal(cl.json.data.status, "CLOSED");
  assert.ok(cl.json.data.closedAt);

  const hist = await requester.get(`/requests/${request.id}/events`);
  assert.deepEqual(hist.json.data.map((e: { kind: string; toStatus: string }) => `${e.kind}:${e.toStatus}`), [
    "CREATED:SUBMITTED", "ASSIGNED:ASSIGNED", "STATUS_CHANGED:IN_PROGRESS", "STATUS_CHANGED:RESOLVED", "STATUS_CHANGED:CLOSED",
  ]);
  const actors = hist.json.data.map((e: { actor: { name: string } }) => e.actor.name);
  const names = await db.user.findMany({ where: { email: { in: ["employee.my@example.com", "manager.my@example.com", "it.owner@example.com"] } } });
  const n = (e: string) => names.find((u) => u.email === e)!.name;
  assert.deepEqual(actors, [n("employee.my@example.com"), n("manager.my@example.com"), n("it.owner@example.com"), n("it.owner@example.com"), n("employee.my@example.com")]);
  // Closed is terminal.
  assert.equal((await requester.post(`/requests/${request.id}/transition`, { action: "CLOSE", expectedVersion: 5 })).status, 422);
});

test("A09: two simultaneous transitions with the same version — exactly one wins, no duplicate event", async () => {
  for (let round = 0; round < 5; round++) {
    const { request } = await newRequest("employee.my@example.com", `Race ${round}`);
    const mgr = await login("manager.my@example.com");
    const hr = await login("hr.admin@example.com");
    const itId = await userId("it.owner@example.com");
    const other = (await db.user.findFirstOrThrow({ where: { department: { name: "IT" }, email: { not: "it.owner@example.com" }, loginEnabled: true } })).id;
    const [r1, r2] = await Promise.all([
      mgr.post(`/requests/${request.id}/assign`, { assigneeId: itId, expectedVersion: 1 }),
      hr.post(`/requests/${request.id}/assign`, { assigneeId: other, expectedVersion: 1 }),
    ]);
    const statuses = [r1.status, r2.status].sort();
    assert.deepEqual(statuses, [200, 409], `round ${round}: ${r1.status}/${r2.status}`);
    assert.equal(await db.requestEvent.count({ where: { requestId: request.id, kind: { in: ["ASSIGNED", "REASSIGNED"] } } }), 1);
    const row = await db.serviceRequest.findUniqueOrThrow({ where: { id: request.id } });
    assert.equal(row.version, 2);
  }
});

test("manager team scope lists only direct reports' requests", async () => {
  const mgr = await login("manager.my@example.com");
  const mgrId = await userId("manager.my@example.com");
  const r = await mgr.get("/requests?scope=team&pageSize=100");
  assert.equal(r.status, 200);
  const ids = r.json.data.map((x: { requester: { id: string } }) => x.requester.id);
  const reports = new Set((await db.user.findMany({ where: { managerId: mgrId }, select: { id: true } })).map((u) => u.id));
  assert.ok(ids.length > 0);
  assert.ok(ids.every((id: string) => reports.has(id)));
});
