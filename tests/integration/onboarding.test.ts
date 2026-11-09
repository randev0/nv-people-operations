import { test, after } from "node:test";
import assert from "node:assert/strict";
import { db, login, userId } from "./helpers";

after(() => db.$disconnect());

const dept = async (name: string) => (await db.department.findUniqueOrThrow({ where: { name } })).id;

async function newHire(hr: Awaited<ReturnType<typeof login>>, suffix: string, opts: { country?: string; joiningDate?: string } = {}) {
  const r = await hr.post("/employees", {
    name: `Test Hire ${suffix}`, email: `test.hire.${suffix}@example.com`, initialPassword: "integration-pass-123",
    role: "EMPLOYEE", countryCode: opts.country ?? "MY", departmentId: await dept("Marketing"),
    managerId: await userId("manager.my@example.com"), joiningDate: opts.joiningDate ?? "2026-10-01", employmentStatus: "ON_PROBATION",
  });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  return r.json.data.id as string;
}

test("O01/O02: HR creates and edits a template; invalid graphs are rejected with 422 and leave it unchanged", async () => {
  const hr = await login("hr.admin@example.com");
  const it = await dept("IT");
  const base = { name: "Integration template", description: "", tasks: [
    { key: "a", title: "A", description: "", departmentId: it, dueDay: 1, sortOrder: 0, prerequisiteKeys: [] },
    { key: "b", title: "B", description: "", departmentId: it, dueDay: 2, sortOrder: 1, prerequisiteKeys: ["a"] },
  ] };
  const c = await hr.post("/onboarding-templates", base);
  assert.equal(c.status, 201, JSON.stringify(c.json));
  const id = c.json.data.id;
  assert.equal(c.json.data.version, 1);

  const bad = [
    { name: "self", tasks: [{ ...base.tasks[0], prerequisiteKeys: ["a"] }] },
    { name: "cycle", tasks: [{ ...base.tasks[0], prerequisiteKeys: ["b"] }, base.tasks[1]] },
    { name: "missing", tasks: [base.tasks[0], { ...base.tasks[1], prerequisiteKeys: ["zzz"] }] },
    { name: "empty", tasks: [] },
  ];
  for (const b of bad) {
    const r = await hr.put(`/onboarding-templates/${id}`, { ...base, tasks: b.tasks, isActive: true, expectedVersion: 1 });
    assert.ok([400, 422].includes(r.status), `${b.name}: ${r.status}`);
    if (b.name === "cycle") assert.equal(r.json.error.code, "DEPENDENCY_CYCLE");
  }
  // Cross-template edge: a key that exists only in another template is "unknown" here.
  const std = await db.templateTask.findFirstOrThrow({ where: { template: { name: "Standard Employee Onboarding" }, key: "laptop" } });
  const cross = await hr.put(`/onboarding-templates/${id}`, { ...base, tasks: [base.tasks[0], { ...base.tasks[1], prerequisiteKeys: [std.key] }], isActive: true, expectedVersion: 1 });
  assert.equal(cross.status, 422);
  const still = await hr.get(`/onboarding-templates/${id}`);
  assert.equal(still.json.data.version, 1);
  assert.deepEqual(still.json.data.tasks.map((t: { key: string }) => t.key), ["a", "b"]);

  const ok = await hr.put(`/onboarding-templates/${id}`, { ...base, name: "Integration template v2", tasks: [...base.tasks, { key: "c", title: "C", description: "", departmentId: it, dueDay: 3, sortOrder: 2, prerequisiteKeys: ["a", "b"] }], isActive: true, expectedVersion: 1 });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.data.version, 2);
  assert.equal((await hr.put(`/onboarding-templates/${id}`, { ...base, isActive: true, expectedVersion: 1 })).status, 409, "stale version");
  const emp = await login("employee.my@example.com");
  assert.equal((await emp.post("/onboarding-templates", base)).status, 403);
});

test("O03/O04/O05: missing owner → 422 with nothing written; duplicate/concurrent assignment → one checklist; template edit leaves snapshot", async () => {
  const hr = await login("hr.admin@example.com");
  const hireId = await newHire(hr, "o3");
  const tpl = await db.onboardingTemplate.findFirstOrThrow({ where: { name: "Standard Employee Onboarding" } });
  const opts = await hr.get(`/onboarding/assignment-options?employeeId=${hireId}&templateId=${tpl.id}`);
  assert.equal(opts.status, 200, JSON.stringify(opts.json));
  const tasks = opts.json.data.tasks as { key: string; dueDate: string; dueDay: number; eligibleOwners: { id: string }[]; suggestedOwnerId: string }[];
  assert.equal(tasks.find((t) => t.key === "checkin")!.dueDate, "2026-10-30", "Day 30 = joining + 29");
  assert.equal(tasks.find((t) => t.key === "policies")!.dueDate, "2026-10-07", "Day 7 = joining + 6");
  const welcome = tasks.find((t) => t.key === "welcome")!;
  assert.deepEqual(welcome.eligibleOwners.map((o) => o.id), [await userId("manager.my@example.com")], "Manager tasks → direct manager only");

  const owners = tasks.map((t) => ({ taskKey: t.key, ownerId: t.suggestedOwnerId }));
  const missing = await hr.post("/onboarding", { employeeId: hireId, templateId: tpl.id, expectedTemplateVersion: opts.json.data.templateVersion, owners: owners.slice(1) });
  assert.equal(missing.status, 422);
  assert.ok(missing.json.error.fieldErrors[`owners.${tasks[0].key}`]);
  assert.equal(await db.onboarding.count({ where: { employeeId: hireId } }), 0);

  const wrongOwner = await hr.post("/onboarding", { employeeId: hireId, templateId: tpl.id, expectedTemplateVersion: opts.json.data.templateVersion,
    owners: owners.map((o) => (o.taskKey === "laptop" ? { ...o, ownerId: hireId } : o)) });
  assert.equal(wrongOwner.status, 422, "hire cannot own an IT task / not in department");

  const body = { employeeId: hireId, templateId: tpl.id, expectedTemplateVersion: opts.json.data.templateVersion, owners };
  const [a, b] = await Promise.all([hr.post("/onboarding", body), hr.post("/onboarding", body)]);
  assert.deepEqual([a.status, b.status].sort(), [201, 409]);
  assert.equal(await db.onboarding.count({ where: { employeeId: hireId } }), 1);
  assert.equal(await db.onboardingTask.count({ where: { onboarding: { employeeId: hireId } } }), 10);
  assert.equal((await hr.post("/onboarding", body)).status, 409);

  // O05: edit the template; the assigned snapshot is unchanged.
  const created = (a.status === 201 ? a : b).json.data;
  const before = created.tasks.map((t: { title: string; dueDate: string }) => `${t.title}|${t.dueDate}`);
  const full = await hr.get(`/onboarding-templates/${tpl.id}`);
  const edited = full.json.data.tasks.map((t: { title: string; dueDay: number }) => ({ ...t, title: `${t.title} (rev)`, dueDay: t.dueDay + 1 }));
  const put = await hr.put(`/onboarding-templates/${tpl.id}`, { name: full.json.data.name, description: full.json.data.description, isActive: true, tasks: edited, expectedVersion: full.json.data.version });
  assert.equal(put.status, 200, JSON.stringify(put.json));
  const after = await hr.get(`/onboarding/${created.id}`);
  assert.deepEqual(after.json.data.tasks.map((t: { title: string; dueDate: string }) => `${t.title}|${t.dueDate}`), before);
  // stale template version is now refused for new assignments
  const hire2 = await newHire(hr, "o5");
  assert.equal((await hr.post("/onboarding", { ...body, employeeId: hire2 })).status, 409);
});

test("O06/O07/O08/O09: prerequisites gate work; owner-only; task owners cannot read the full checklist", async () => {
  const empMy = await login("employee.my@example.com");
  const it = await login("it.owner@example.com");
  const hr = await login("hr.admin@example.com");
  const onb = await db.onboarding.findFirstOrThrow({ where: { employee: { email: "employee.my@example.com" } }, include: { tasks: true } });
  const t = (k: string) => onb.tasks.find((x) => x.sourceTaskKey === k)!;

  // O09: it.owner owns tasks on this checklist but has no checklist read scope.
  assert.equal((await it.get(`/onboarding/${onb.id}`)).status, 404);
  const mine = await it.get("/my-work?kind=task&pageSize=100");
  const accountTask = mine.json.data.find((x: { id: string }) => x.id === t("account").id);
  assert.ok(accountTask, "owned task visible in My Work");
  assert.deepEqual(Object.keys(accountTask.hire).sort(), ["department", "id", "name"]);

  // O06: security (Compliance) depends on account, which is in progress → blocked.
  const sec = t("security");
  const secOwner = await db.user.findUniqueOrThrow({ where: { id: sec.ownerId } });
  const secClient = await login(secOwner.email);
  const blocked = await secClient.post(`/onboarding-tasks/${sec.id}/transition`, { action: "START", expectedVersion: sec.version });
  assert.equal(blocked.status, 422);
  assert.equal(blocked.json.error.code, "PREREQUISITES_INCOMPLETE");
  assert.match(blocked.json.error.message, /Create company account/);
  assert.equal((await secClient.post(`/onboarding-tasks/${sec.id}/transition`, { action: "COMPLETE", expectedVersion: sec.version })).status, 422);

  // O08: the new hire and HR cannot complete the IT task; the IT owner can.
  assert.equal((await empMy.post(`/onboarding-tasks/${t("account").id}/transition`, { action: "COMPLETE", expectedVersion: t("account").version })).status, 403);
  assert.equal((await hr.post(`/onboarding-tasks/${t("account").id}/transition`, { action: "COMPLETE", expectedVersion: t("account").version })).status, 403);
  const done = await it.post(`/onboarding-tasks/${t("account").id}/transition`, { action: "COMPLETE", expectedVersion: t("account").version });
  assert.equal(done.status, 200, JSON.stringify(done.json));
  assert.equal(done.json.data.status, "COMPLETED");

  // O07: security is now available without any manual unblock.
  const own = await empMy.get(`/onboarding/${onb.id}`);
  const secNow = own.json.data.tasks.find((x: { id: string }) => x.id === sec.id);
  assert.equal(secNow.effectiveStatus, "NOT_STARTED");
  const started = await secClient.post(`/onboarding-tasks/${sec.id}/transition`, { action: "START", expectedVersion: sec.version });
  assert.equal(started.status, 200);
  assert.equal(started.json.data.status, "IN_PROGRESS");
  const stale = await secClient.post(`/onboarding-tasks/${sec.id}/transition`, { action: "COMPLETE", expectedVersion: sec.version });
  assert.equal(stale.status, 409);

  // Events readable by the owner.
  const ev = await it.get(`/onboarding-tasks/${t("account").id}/events`);
  assert.equal(ev.status, 200);
  assert.equal(ev.json.data.at(-1).toStatus, "COMPLETED");
  // Unrelated employee can neither read the checklist nor the task's events.
  const cy = await login("employee.cy@example.com");
  assert.equal((await cy.get(`/onboarding/${onb.id}`)).status, 404);
  assert.equal((await cy.get(`/onboarding-tasks/${t("account").id}/events`)).status, 404);
});

test("O12: final two tasks completed concurrently still mark the checklist complete", async () => {
  const hr = await login("hr.admin@example.com");
  const facilities = await dept("Facilities");
  const tplRes = await hr.post("/onboarding-templates", { name: "Two-task race", description: "", tasks: [
    { key: "x", title: "X", description: "", departmentId: facilities, dueDay: 1, sortOrder: 0, prerequisiteKeys: [] },
    { key: "y", title: "Y", description: "", departmentId: facilities, dueDay: 1, sortOrder: 1, prerequisiteKeys: [] },
  ] });
  assert.equal(tplRes.status, 201);
  const tpl = tplRes.json.data;
  for (let round = 0; round < 6; round++) {
    const hireId = await newHire(hr, `o12-${round}`);
    const opts = await hr.get(`/onboarding/assignment-options?employeeId=${hireId}&templateId=${tpl.id}`);
    const owners = opts.json.data.tasks[0].eligibleOwners.slice(0, 2);
    assert.equal(owners.length, 2);
    const created = await hr.post("/onboarding", { employeeId: hireId, templateId: tpl.id, expectedTemplateVersion: tpl.version,
      owners: [{ taskKey: "x", ownerId: owners[0].id }, { taskKey: "y", ownerId: owners[1].id }] });
    assert.equal(created.status, 201, JSON.stringify(created.json));
    const emails = await db.user.findMany({ where: { id: { in: [owners[0].id, owners[1].id] } } });
    const clientFor = async (id: string) => login(emails.find((e) => e.id === id)!.email);
    const [c0, c1] = [await clientFor(owners[0].id), await clientFor(owners[1].id)];
    const [tx, ty] = created.json.data.tasks;
    const cx = tx.owner.id === owners[0].id ? c0 : c1;
    const cy = cx === c0 ? c1 : c0;
    assert.equal((await cx.post(`/onboarding-tasks/${tx.id}/transition`, { action: "START", expectedVersion: 1 })).status, 200);
    assert.equal((await cy.post(`/onboarding-tasks/${ty.id}/transition`, { action: "START", expectedVersion: 1 })).status, 200);
    const [r1, r2] = await Promise.all([
      cx.post(`/onboarding-tasks/${tx.id}/transition`, { action: "COMPLETE", expectedVersion: 2 }),
      cy.post(`/onboarding-tasks/${ty.id}/transition`, { action: "COMPLETE", expectedVersion: 2 }),
    ]);
    assert.deepEqual([r1.status, r2.status], [200, 200]);
    const onb = await db.onboarding.findUniqueOrThrow({ where: { id: created.json.data.id } });
    assert.ok(onb.completedAt, `round ${round}: completedAt must be set`);
  }
});

test("employees: reporting-line invariants", async () => {
  const hr = await login("hr.admin@example.com");
  const mgrId = await userId("manager.my@example.com");
  const empId = await userId("employee.my@example.com");
  assert.equal((await hr.patch(`/employees/${mgrId}`, { role: "EMPLOYEE" })).status, 422, "manager with reports cannot be demoted");
  assert.equal((await hr.patch(`/employees/${mgrId}`, { managerId: mgrId })).status, 422, "self-manager");
  assert.equal((await hr.patch(`/employees/${empId}`, { managerId: await userId("it.owner@example.com") })).status, 422, "employee cannot be a manager");
  const hrId = await userId("hr.admin@example.com");
  assert.equal((await hr.patch(`/employees/${hrId}`, { managerId: mgrId })).status, 422, "cycle hr → manager → hr");
  const dup = await hr.post("/employees", { name: "Dup", email: "EMPLOYEE.MY@example.com", initialPassword: "integration-pass-123", role: "EMPLOYEE", countryCode: "MY", departmentId: await dept("IT"), managerId: null, joiningDate: "2026-01-01", employmentStatus: "ACTIVE" });
  assert.equal(dup.status, 409);
  const mgr = await login("manager.my@example.com");
  const team = await mgr.get("/employees?pageSize=100");
  assert.ok(team.json.data.every((e: { id: string; managerId: string | null }) => e.id === mgrId || e.managerId === mgrId));
  assert.equal((await mgr.patch(`/employees/${empId}`, { name: "Renamed" })).status, 403);
});
