import { test, after } from "node:test";
import assert from "node:assert/strict";
import { BASE, Client, PASSWORD, db, login } from "./helpers";

after(() => db.$disconnect());

test("A01: each documented role logs in and sees its own identity; invalid password denied; logout invalidates", async () => {
  for (const [email, role] of [
    ["hr.admin@example.com", "HR_ADMIN"],
    ["manager.my@example.com", "MANAGER"],
    ["employee.my@example.com", "EMPLOYEE"],
    ["it.owner@example.com", "EMPLOYEE"],
    ["employee.cy@example.com", "EMPLOYEE"],
  ]) {
    const c = await login(email);
    const me = await c.get("/auth/me");
    assert.equal(me.status, 200);
    assert.equal(me.json.data.email, email);
    assert.equal(me.json.data.role, role);
    assert.equal(me.json.data.passwordHash, undefined);
    assert.equal(me.json.data.sessionVersion, undefined);
  }
  const bad = await new Client().post("/auth/login", { email: "employee.my@example.com", password: "not-the-password" });
  assert.equal(bad.status, 401);
  assert.equal(bad.json.error.code, "INVALID_CREDENTIALS");
  const unknown = await new Client().post("/auth/login", { email: "nobody@example.com", password: "x" });
  assert.equal(unknown.json.error.message, bad.json.error.message, "same generic message for unknown email");

  const c = await login("employee.my@example.com");
  const stolen = c.cookie;
  assert.equal((await c.post("/auth/logout")).status, 204);
  assert.equal((await c.get("/auth/me")).status, 401);
  // A copy of the pre-logout cookie must not work either (sessionVersion bumped on logout).
  const replay = new Client();
  replay.cookie = stolen;
  assert.equal((await replay.get("/auth/me")).status, 401);
});

test("A02: unauthenticated API calls get 401 without data", async () => {
  const c = new Client();
  for (const p of ["/requests", "/requests/00000000-0000-4000-8000-000000000000", "/employees", "/dashboard", "/my-work", "/onboarding", "/auth/me"]) {
    const r = await c.get(p);
    assert.equal(r.status, 401, p);
    assert.deepEqual(Object.keys(r.json), ["error", "requestId"]);
  }
  assert.equal((await c.post("/requests", { title: "x" })).status, 401);
});

test("mutations without a matching Origin are rejected", async () => {
  const c = await login("employee.my@example.com");
  c.origin = "https://evil.example";
  const r = await c.post("/requests/00000000-0000-4000-8000-000000000000/comments", { body: "hi" });
  assert.equal(r.status, 403);
  assert.equal(r.json.error.code, "BAD_ORIGIN");
  c.origin = null;
  assert.equal((await c.post("/auth/logout")).status, 403);
});

test("A10: employee calling HR-only APIs directly gets 403", async () => {
  const c = await login("employee.cy@example.com");
  assert.equal((await c.get("/dashboard")).status, 403);
  assert.equal((await c.get("/employees")).status, 403);
  assert.equal((await c.get("/onboarding-templates")).status, 403);
  assert.equal((await c.get("/requests?scope=all")).status, 403);
  assert.equal((await c.get("/requests?scope=team")).status, 403);
  const created = await c.post("/employees", {
    name: "X", email: "x@example.com", initialPassword: "aaaaaaaaaaaa", role: "HR_ADMIN", countryCode: "CY",
    departmentId: (await db.department.findFirstOrThrow()).id, managerId: null, joiningDate: "2026-01-01", employmentStatus: "ACTIVE",
  });
  assert.equal(created.status, 403);
  assert.equal(await db.user.count({ where: { email: "x@example.com" } }), 0);
});

test("A11: disabling a user invalidates an existing session immediately", async () => {
  const victim = "employee.cy@example.com";
  const session = await login(victim);
  assert.equal((await session.get("/auth/me")).status, 200);
  const hr = await login("hr.admin@example.com");
  const id = (await db.user.findUniqueOrThrow({ where: { email: victim } })).id;
  const dis = await hr.patch(`/employees/${id}`, { loginEnabled: false });
  assert.equal(dis.status, 200);
  assert.equal((await session.get("/auth/me")).status, 401);
  assert.equal((await session.get("/requests")).status, 401);
  assert.equal((await new Client().post("/auth/login", { email: victim, password: PASSWORD })).status, 401);
  // Re-enable for the remaining tests; old cookie must stay invalid (sessionVersion moved on).
  assert.equal((await hr.patch(`/employees/${id}`, { loginEnabled: true })).status, 200);
  assert.equal((await session.get("/auth/me")).status, 401);
});

test("login throttle returns 429 after the configured attempts", async () => {
  const email = "throttle-probe@example.com";
  const statuses: number[] = [];
  for (let i = 0; i < 12; i++) statuses.push((await new Client().post("/auth/login", { email, password: "x" })).status);
  assert.deepEqual(statuses.slice(0, 10), Array(10).fill(401));
  assert.deepEqual(statuses.slice(10), [429, 429]);
});

test("rotating X-Forwarded-For past the account-wide threshold slows sign-in down but never locks the real user out", async () => {
  const { email } = await db.user.findFirstOrThrow({ where: { role: "EMPLOYEE", loginEnabled: true, countryCode: "LK", email: { not: { contains: "employee." } } } });
  const statuses: number[] = [];
  for (let i = 0; i < 31; i++) {
    const r = await new Client().req("POST", "/auth/login", { email, password: "wrong-guess" }, { "x-forwarded-for": `198.51.100.${i}` });
    statuses.push(r.status);
  }
  assert.deepEqual(statuses, Array(31).fill(401)); // no account-wide 429
  // Beyond 3 × per-IP limit each attempt is delayed (LOGIN_SLOWDOWN_MS=300 in tests)…
  const t0 = Date.now();
  const r = await new Client().req("POST", "/auth/login", { email, password: PASSWORD }, { "x-forwarded-for": "203.0.113.9" });
  assert.ok(Date.now() - t0 >= 250, "slowed");
  // …and the real owner on a fresh address still gets in.
  assert.equal(r.status, 200);
});

test("health endpoint exposes no configuration", async () => {
  const r = await fetch(`${BASE}/api/health`);
  assert.deepEqual(await r.json(), { status: "ok" });
});
