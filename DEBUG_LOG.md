# Debug Log

Three issues observed during development, written up in the required format. Raw notes are in `WORKLOG.md`.

**Honest classification:** only Bug 1 is a significant application security defect found at runtime. Bug 2 is a real but lower-severity application defect (it only shows when client JavaScript fails to load). Bug 3 was a genuine defect in the test suite, not in the application. No bugs were introduced deliberately and none of these were described before they were observed. Static concerns about the donor repository (missing per-record checks in its ticket routes) are **not** included because they were never reproduced here.

---

## Bug 1 — A copied session cookie stayed valid after logout

**Affected commit/date:** `07ae6e8`, 2026-11-09.

**Symptom:** after signing out, a copy of the earlier session cookie could still call the API as the signed-out user. Reproduction against the running build on :3000:

```text
curl -c jar  POST /api/auth/login (employee.my)        -> 200
cp jar jar-copy
curl -b jar -c jar POST /api/auth/logout               -> 204
curl -b jar       GET /api/auth/me                     -> 401
curl -b jar-copy  GET /api/auth/me                     -> 200 {"data":{"id":"c07916c9-…","email":"employee.my@example.com",…}}
```

**Investigation:**
- First hypothesis: the logout route wasn't clearing the cookie. Ruled out: the response sets an expired `po_session` cookie and the cleared jar gets 401.
- Second hypothesis: the server has no revocation state. iron-session seals `{userId, sessionVersion}` into the cookie itself, and `destroy()` only tells the browser to drop it. In `src/server/auth/current-user.ts:28` a cookie is accepted if it decrypts, the user is enabled and `u.sessionVersion === session.sessionVersion`. Logout never changed `sessionVersion`, so any copy of the cookie (shared machine, proxy log, malware) kept working for the full 7-day TTL.

**Root cause:** stateless sealed cookies plus a logout that only cleared the client copy. `src/server/auth/login.ts` `logout()` called `session.destroy()` and nothing else.

**Fix:** (`36be90d`, `src/server/auth/login.ts:47`)

```ts
export async function logout(userId: string) {
  const session = await getSession();
  await db.user.update({ where: { id: userId }, data: { sessionVersion: { increment: 1 } } });
  session.destroy();
}
```

Incrementing the version makes every previously issued cookie for that user fail the version check. Disabling an account already used the same mechanism. Trade-off, documented in ARCHITECTURE §4/§9: logout signs the user out on all devices.

**Verification:** integration test A01 now replays the copied pre-logout cookie and asserts 401. It passes in three consecutive `npm run test:integration` runs (23/23). Before the fix, the same request returned 200 (output above).

**Prevention:** the A01 regression test stays in the suite. A per-device session table would allow single-device logout if that is needed later.

---

## Bug 2 — Login form leaked the password into the URL when JavaScript failed

**Affected commit/date:** `07ae6e8` / `36be90d`, 2026-11-09.

**Symptom:** while taking UI screenshots, a Playwright login never reached `/dashboard`. The browser ended up on:

```text
url http://localhost:3000/login?email=hr.admin%40example.com&password=PeopleOps-Demo-2026%21
```

The same run's console showed `Refused to execute script from '…/_next/static/chunks/085rn02y_t89y.js' because its MIME type ('text/plain') …` and 404s for CSS/JS chunks.

**Investigation:**
- First hypothesis: a broken login API. Ruled out: `curl POST /api/auth/login` → 200 against the same server.
- The 404 chunk names didn't match the fresh `.next` build. `pkill -f "next start"` had not stopped the earlier server, which runs as process `next-server`. That old process still held port 3000 and served HTML referring to chunks from the previous build.
- Why the credentials ended up in the URL: with no JS, React's `onSubmit` never ran and the `<form>` in `src/app/(auth)/login/login-form.tsx` had no `method`, so the browser did a native **GET** submit. Credentials in a query string reach browser history, proxy logs and server access logs.

**Root cause:** the login form relied entirely on client JS and fell back to the HTML default method (GET). The stale server only exposed the problem; any JS load failure (CDN or network error, a blocked script, a deploy mismatch) would do the same.

**Fix:** (`21871a0`, `login-form.tsx:32`) the form declares `method="post"`, so a no-JS fallback never puts fields in the URL. I stopped the stale process with `pkill -f next-server`.

**Verification:** a Playwright context with `javaScriptEnabled: false` submits the form → `method POST status 200 url http://localhost:3000/login` (no query string). With JS enabled, the e2e suite still passes (5/5).

**Prevention:** proposed, not implemented: an e2e test with JS disabled asserting no credentials in the URL. Also use `pkill -f next-server` (not `next start`) in local scripts.

---

## Bug 3 — Integration test depended on another file's side effects (test-suite defect)

**Affected commit/date:** `36be90d` (pre-commit run), 2026-11-09.

**Symptom:** the first full integration run was 22/23. `O06/O07/O08/O09` failed at `onboarding.test.ts:120`:

```text
Expected values to be strictly equal:
200 !== 422
```

Starting "Complete security briefing" succeeded even though its prerequisite "Create company account" was seeded as IN_PROGRESS.

**Investigation:**
- First hypothesis: a real prerequisite-check bug in `transitionTask`. Checked the service: it reads prerequisites inside the locked transaction and rejects any that are not COMPLETED, and the unit tests for `effectiveStatus` pass. If the prerequisite really was incomplete, a 200 would be impossible, so the data had to have changed.
- Second hypothesis: an earlier test mutated the fixture. `node:test` runs files alphabetically, so `dashboard-ai.test.ts` (D03) ran before `onboarding.test.ts`. D03 completes "the first IN_PROGRESS overdue task", using `findMany` with no `orderBy`. In a fresh seed that is employee.my's `account` task, which unblocks `security`.

**Root cause:** shared seeded state plus non-deterministic selection in D03 (`tests/integration/dashboard-ai.test.ts`).

**Fix:** D03 now excludes employee.my's checklist and orders by id:

```ts
where: { status: "IN_PROGRESS", onboarding: { employee: { email: { not: "employee.my@example.com" } } } },
orderBy: { id: "asc" },
```

**Verification:** the next three runs were 23/23.

**Prevention:** each run uses a fresh database (`tests/integration/run.ts`). Tests that mutate shared fixtures should create their own data (as O03/O12 already do).
