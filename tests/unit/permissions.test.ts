import { test } from "node:test";
import assert from "node:assert/strict";
import * as P from "../../src/server/auth/permissions";
import { transitionTarget, assignmentKind } from "../../src/server/requests/state-machine";

const hr: P.Actor = { id: "hr", role: "HR_ADMIN" };
const mgr: P.Actor = { id: "mgr", role: "MANAGER" };
const otherMgr: P.Actor = { id: "mgr2", role: "MANAGER" };
const emp: P.Actor = { id: "emp", role: "EMPLOYEE" };
const it: P.Actor = { id: "it", role: "EMPLOYEE" };
const stranger: P.Actor = { id: "x", role: "EMPLOYEE" };

const req = (over: Partial<P.RequestAccessFacts> = {}): P.RequestAccessFacts => ({
  requesterId: "emp", assigneeId: "it", status: "ASSIGNED", requester: { managerId: "mgr" }, ...over,
});

test("request read scope", () => {
  assert.ok(P.canReadRequest(emp, req()));
  assert.ok(P.canReadRequest(it, req())); // assignee exception
  assert.ok(P.canReadRequest(mgr, req()));
  assert.ok(P.canReadRequest(hr, req()));
  assert.ok(!P.canReadRequest(stranger, req()));
  assert.ok(!P.canReadRequest(otherMgr, req())); // A04
});

test("assignment: HR or direct manager, never own request", () => {
  assert.ok(P.canAssignRequest(hr, req()));
  assert.ok(P.canAssignRequest(mgr, req()));
  assert.ok(!P.canAssignRequest(otherMgr, req()));
  assert.ok(!P.canAssignRequest(emp, req()));
  assert.ok(!P.canAssignRequest(mgr, req({ requesterId: "mgr", requester: { managerId: "hr" } })));
});

test("start/resolve assignee only, no admin bypass; close by requester/manager/HR", () => {
  assert.ok(P.canTransitionRequest(it, req(), "START"));
  assert.ok(!P.canTransitionRequest(hr, req(), "START"));
  assert.ok(!P.canTransitionRequest(emp, req(), "RESOLVE"));
  assert.ok(P.canTransitionRequest(emp, req(), "CLOSE"));
  assert.ok(P.canTransitionRequest(mgr, req(), "CLOSE"));
  assert.ok(P.canTransitionRequest(hr, req(), "CLOSE"));
  assert.ok(!P.canTransitionRequest(it, req(), "CLOSE"));
});

test("list scopes", () => {
  assert.equal(P.requestListScopeWhere(emp, "team"), null);
  assert.equal(P.requestListScopeWhere(emp, "all"), null);
  assert.equal(P.requestListScopeWhere(mgr, "all"), null);
  assert.deepEqual(P.requestListScopeWhere(hr, "all"), {});
  assert.deepEqual(P.requestReadScopeWhere(emp), { OR: [{ requesterId: "emp" }, { assigneeId: "emp" }] });
});

test("onboarding and task ownership", () => {
  const o = { employeeId: "emp", employee: { managerId: "mgr" } };
  assert.ok(P.canReadOnboarding(emp, o) && P.canReadOnboarding(mgr, o) && P.canReadOnboarding(hr, o));
  assert.ok(!P.canReadOnboarding(it, o)); // O09: task owner gets no checklist access
  assert.ok(P.canWorkTask(it, { ownerId: "it" }));
  assert.ok(!P.canWorkTask(hr, { ownerId: "it" }));
  assert.equal(P.employeeListScopeWhere(emp), null);
});

test("state machine forbids skipping", () => {
  assert.equal(transitionTarget("CLOSE", "SUBMITTED"), null);
  assert.equal(transitionTarget("START", "SUBMITTED"), null);
  assert.equal(transitionTarget("START", "ASSIGNED"), "IN_PROGRESS");
  assert.equal(transitionTarget("RESOLVE", "IN_PROGRESS"), "RESOLVED");
  assert.equal(transitionTarget("CLOSE", "RESOLVED"), "CLOSED");
  assert.equal(assignmentKind("IN_PROGRESS"), null);
  assert.equal(assignmentKind("ASSIGNED"), "REASSIGN");
});
