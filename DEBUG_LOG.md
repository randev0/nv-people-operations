# Debug Log

The three most significant bugs from development, in the required format, followed by five more found later and recorded the same way. Raw notes, written as things happened, are in `WORKLOG.md`; commit hashes point to the fixes.

Why these three: Bug 1 was a security defect (a signed-out session stayed usable), Bug 2 leaked passwords into URLs and logs, and Bug 3 broke the harness that proves the AI feature degrades safely, while looking exactly like a real AI outage. All were observed at runtime and reproduced before they were fixed; none were introduced deliberately.

| # | Layer | Bug | Fix |
| --- | --- | --- | --- |
| 1 | Authentication | Copied session cookie stayed valid after logout | `36be90d` |
| 2 | Frontend / security | Login form put the password in the URL when JavaScript failed | `21871a0` |
| 3 | AI integration / test infrastructure | Fake AI bridge never answered; tests hung 50 s per call | `3d6304d` |
| 4 | Deployment / security headers | CSP blocked every script on the prerendered 404 page | `57b027e` |
| 5 | Frontend build | Tailwind opacity classes silently missing from the CSS | `e654398` |
| 6 | Dashboard data | Dashboard figures opened lists with different records | dashboard review, 2026-11-09 |
| 7 | Frontend state | "Use as assignee" failed with a false "not eligible" error | dashboard review, 2026-11-09 |
| 8 | Deployment / operations | Demo reset dropped the live database, then could not rebuild it | 2026-11-10, see entry |

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

Incrementing the version makes every previously issued cookie for that user fail the version check. Disabling an account already used the same mechanism. Trade-off, documented in ARCHITECTURE §4.2 and ADR-8: logout signs the user out on all devices.

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

**Prevention:** e2e regression test `tests/e2e/flows.spec.ts` → "sign-in form with JavaScript disabled posts, and credentials never reach the URL" (a JS-disabled browser context submits the form and asserts a POST navigation and no email or password in the URL). Local scripts stop servers with `pkill -f next-server`, not `next start`. Writing this prevention up turned up a second instance of the same class: the HR "Add employee" dialog (`employee-dialog.tsx`), which has an initial-password field, also had a `<form>` with no method, as did four other JS-handled forms (2026-11-10). All now say `method="post"`, and a unit test (`tests/unit/forms-post.test.ts`) fails if any `<form>` in `src/` omits its method or a form with a password field does not post; it fails against the previous code, listing those six forms.

---

## Bug 3 — AI tests hung for 50 seconds per call: the fake AI bridge never answered

**Affected commit/date:** the AI router work that became `3d6304d`, 2026-11-09 (found before that commit on the first test run of the new suite).

**Symptom:** the first integration run with the new AI tests had 3 failures. The AI02 case ("provider returns invalid output → 503 `AI_INVALID_OUTPUT`") took about 100 seconds and returned `AI_UNAVAILABLE` instead. Stored request suggestions stayed `PENDING` (the test failed with "suggestion never finished"). In the product this is the same screen a user sees when the real AI is down, so the test could not tell "our fallback works" from "the harness is broken".

**Investigation:**
- First hypothesis: the fake bridge (`tests/integration/fake-bridge.ts`, a deterministic stand-in for the Codex bridge on a unix socket) returned the wrong shape, so the app rejected it. Ruled out: it had never logged a request, so it had not answered anything, right or wrong.
- Second hypothesis: the app never reached it. The timing said otherwise: 100 s for two AI calls is exactly two of the app's 50 s bridge timeouts (`CODEX_BRIDGE_TIMEOUT_MS`, default 50 000). The app was connecting and waiting; nobody was reading the socket.
- Who should have been reading it: the fake bridge runs **inside the test runner process** (`tests/integration/run.ts`), and the runner launched the test child with `spawnSync`. `spawnSync` blocks the runner's event loop until the child exits, so the bridge's connection handler, which runs on that event loop, never ran.

**Root cause:** a synchronous child-process call in a process that also hosts a server. The two designs were each reasonable alone (synchronous runner from the first harness, in-process fake added for AI) and wrong together.

**Fix:** (`3d6304d`, `tests/integration/run.ts`) test and Playwright children run with async `spawn`, so the runner's event loop keeps serving the fake bridge (diff abridged):

```diff
-    const t = spawnSync("npx", ["tsx", "--test", "--test-concurrency=1", ...files], { env, stdio: "inherit" });
-    process.exitCode = t.status ?? 1;
+    process.exitCode = await runAsync("npx", ["tsx", "--test", "--test-concurrency=1", ...files], { BASE_URL: `http://localhost:${PORT}` }, true);

+/**
+ * Async child process. The runner hosts the fake AI bridge in-process, so the test
+ * child must NOT be started with spawnSync (that blocks the event loop and the
+ * bridge never answers).
+ */
+function runAsync(cmd: string, args: string[], extraEnv: Record<string, string> = {}, shell = false): Promise<number> {
+  return new Promise((resolve) => {
+    const child = spawn(cmd, args, { env: { ...env, ...extraEnv }, stdio: "inherit", shell });
+    child.on("close", (code) => resolve(code ?? 1));
+  });
+}
```

**Verification:** the next run passed: integration 26/26, e2e 5/5, including AI02 (`AI_INVALID_OUTPUT`) and the stored suggestions reaching `READY`.

**Prevention:** the warning comment sits on `runAsync`, the only way the runner starts suites. The test environment sets `CODEX_BRIDGE_TIMEOUT_MS=2000` (`992ebd6`), so a bridge that stops answering fails a test in 2 s with a clear timeout instead of a 100 s hang, and a dedicated "[ai-slow]" case proves the timeout path.

---

## Further bugs, same format

Found after the first three were written up: in the exploratory re-test (4), the UI redesign (5), a calculation-by-calculation dashboard review (6, 7) and the final pre-submission check on the live server (8).

### Bug 4 — The security headers blocked every script on the 404 page

**Affected commit/date:** the security-header change in `57b027e`, 2026-11-10 (caught in the re-test before that commit; reproduced again for this write-up).

**Symptom:** during the re-run of the exploratory tests after adding a nonce-based Content-Security-Policy (`src/proxy.ts`), the branded "Page not found" page showed CSP violations in the browser console: the browser refused its scripts, so nothing interactive on that page could work. Reproduced on 2026-11-10 by building with the fix removed and loading `/this-page-does-not-exist` in Chromium:

```text
status 404
csp script-src: script-src 'self' 'nonce-…' 'strict-dynamic'
scripts: [{"src":"2rv5jvl35qh22.js","nonce":null},{"src":"2wye36b3mbzpa.js","nonce":null}, …]
console errors: 15
  Loading the script 'http://localhost:3100/_next/static/chunks/44is5unny0ti1.js' violates the following
  Content Security Policy directive: "script-src 'self' 'nonce-ZjMwMzc2…' 'strict-dynamic'" …
```

**Investigation:** (the original notes record the violations and the cause; the steps below are the same checks repeated on the reproduction)
- Only the 404 page was affected: signed-in pages under the same policy ran their scripts normally, so the policy text itself was not the problem.
- On working pages every `<script>` carries the nonce from the `x-nonce` request header; on the 404 page `nonce` was empty on all of them (output above).
- The build summary explains why: `○ /_not-found` (static). Next.js applies the per-request nonce only when it renders the page for that request. The not-found page was prerendered at build time, when no nonce existed, while the proxy still sent a fresh nonce policy with every response. With `'strict-dynamic'`, a script without the nonce is refused even from `'self'`.

**Root cause:** a per-request security header combined with a page rendered once at build time. Any page Next.js decides is static would have the same problem; the 404 page was simply the first one with no dynamic data.

**Fix:** (`57b027e`, `src/app/layout.tsx`) the root layout reads the request headers, which makes every page render per request and receive the nonce:

```ts
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Content-Security-Policy nonce from src/proxy.ts (static pages would carry none).
  await headers();
```

The build summary then lists `ƒ /_not-found` (dynamic). Cost: no static HTML caching, which is irrelevant for an authenticated internal app.

**Verification:** after rebuilding, the same check shows every script with a nonce and only one console error, the expected 404 for the page itself. The exploratory re-run then found no CSP violations on any page.

**Prevention:** e2e regression test `tests/e2e/flows.spec.ts` → "CSP: scripts on the not-found page carry the per-request nonce and none are refused". When adding any header that changes per request, check the build summary for `○` routes, because those never see the request.

### Bug 5 — Tailwind opacity classes generated no CSS, so chart bars and hover states were invisible

**Affected commit/date:** `b4c8a08` (first adapted UI primitives) through `9709361`, found 2026-11-09 during the UI redesign.

**Symptom:** reviewing a 1440 px screenshot of the HR dashboard, every bar in the three charts was an empty grey track, while the numbers next to them (8 / 8 / 8 …) were correct.

**Investigation:**
- First hypothesis: zero widths. Ruled out: the text values were non-zero and the DOM showed the inline `style="width: 62%"` on each fill element.
- Second hypothesis: the fill had no colour. Grepped the compiled CSS in `.next/static/css`: `.bg-primary{background-color:var(--primary)}` existed, but `.bg-primary\/85` was absent. So were `hover:bg-primary/90`, `hover:bg-muted/40`, `bg-primary/20` and `bg-destructive/90`.
- Tailwind only emits an opacity-modified colour when it can inject the alpha. The donor mapping `primary: "var(--primary)"` with `--primary` holding a complete colour gives it nowhere to do that, so each `/NN` class was dropped silently, with no build warning.

**Root cause:** the colour-token format adapted from the donor (`tailwind.config.ts`, `src/app/globals.css`) was incompatible with Tailwind opacity modifiers. Since the first UI commit, button hover states, table-row hover, progress-bar tracks and destructive hovers had also been invisible.

**Fix:** (`e654398`) tokens are HSL channels (`--primary: 244 52% 44%`) and the config maps `primary: "hsl(var(--primary) / <alpha-value>)"` for every colour.

**Verification:** after rebuilding, the compiled CSS contains `.bg-primary\/85{background-color:hsl(var(--primary) / .85)}`. The dashboard screenshot shows filled bars, and the axe scan (15 pages, 0 violations, which includes colour contrast) still passes.

**Prevention:** e2e regression test `tests/e2e/flows.spec.ts` → "compiled CSS contains opacity-modified colour classes" reads the stylesheet rules the browser actually loaded and fails if `bg-primary/90` or `bg-danger/10` is missing, so a token format that cannot take an alpha value breaks the build's test run instead of silently hiding UI states.

### Bug 6 — Dashboard metric cards opened lists that did not contain the records behind their numbers

**Affected commit/date:** "Open requests" link since `07ae6e8`; "Resolved this week" link since `bc3089f`; found 2026-11-09.

**Symptom:** the HR card "Open requests 24" opened `/requests?scope=all`, which listed **40** requests (every status). The card "Resolved this week 8" opened `/requests?scope=all&status=RESOLVED`, which also showed 8 rows, but not the same 8.

**Investigation:**
- Traced each number to its query in `src/server/dashboard/service.ts`. "Open requests" counts status ∈ {SUBMITTED, ASSIGNED, IN_PROGRESS}, but the list API had no way to express that group, so the link fell back to an unfiltered list.
- "Resolved this week" counted `resolvedAt` inside the rolling 7×24 h ending at `asOf`; the link filtered on *current status* RESOLVED. Checked in SQL on the local seed: `resolvedAt` in the last 7 days = 8, status RESOLVED = 8, both = 7. One request resolved 7 days ago had since been **closed** (counted by the card, missing from the list), and one resolved 9 days ago was still RESOLVED (in the list, not counted). Equal totals hid the mismatch.
- The label "this week" also suggested a calendar week while the code used a rolling window.

**Root cause:** the dashboard's definitions had no equivalent filters in the request list, so the links approximated them.

**Fix:** the list API accepts `status=OPEN` and `resolved=last-7-days` (`src/server/requests/schemas.ts`, `service.ts`), applied inside the normal read scope; the cards link to exactly those filters, the list shows a banner stating the definition, and the card reads "Resolved, last 7 days" with the comparison "vs N in the 7 days before". "Overdue onboarding tasks" now jumps to the full overdue task list on the same page.

**Verification:** e2e `verification-flows.spec.ts` test 5 reads each card's number and asserts the list it opens shows the same count ("24 requests", "8 requests"). The first version of that test passed for the wrong reason: it took the first digit in the accessible name, which was the "7" of "last 7 days". It now reads the value element itself.

**Prevention:** every dashboard number that links somewhere has a list filter with the same definition, and the e2e test compares them.

### Bug 7 — "Use as assignee" on the AI suggestion could fail with a false "not eligible" error

**Affected commit/date:** since the assigner suggestion panel (`3d6304d`), found 2026-11-09 when an e2e run failed.

**Symptom:** `flows.spec.ts` failed at `expect(getByLabel("Assign to")).not.toHaveValue("")`. The trace showed the select still disabled ("Loading people…") when the manager clicked "Use Priya Ismail as assignee"; afterwards the select stayed empty.

**Investigation:** in `src/components/requests/request-actions.tsx` the handler checked `options?.some(...)`. While the eligible-assignee list was still loading, `options` was `null`, so the check failed and the panel showed "The suggested person is not an eligible assignee", which is false: she is eligible. Earlier runs passed only because the list usually loaded before the click. The same run also exposed a test race (clicking "Start work" before the detail page replaced the My Work list), fixed separately in the test.

**Root cause:** the click handler treated "not loaded yet" the same as "not eligible".

**Fix:** a choice made before the list arrives is kept (`wanted`) and applied as soon as the options load; the eligibility error is shown only when the loaded list really excludes the person.

**Verification:** e2e suite run twice in a row after the fix: 12/12 both times.

**Prevention:** UI handlers distinguish "not loaded yet" from "not allowed" (pending state kept and applied on load); the e2e flow clicks the suggestion as early as possible.

### Bug 8 — The demo reset dropped the live database, then could not rebuild it

**Affected date:** 2026-11-10, 02:47–02:52 UTC, on the live server. Outage about four minutes.

**Symptom:** a manual run of the nightly reset (`systemctl start peopleops-reset`), done to clear walkthrough test data before submission, ended `failed`. The journal showed the schema drop succeeding (`drop cascades to 26 other objects`), then:

```text
npm error npx canceled due to missing packages and no YES option: ["prisma@8.0.0-rc.33"]
```

The app was restarted by the script's error trap, so `/api/health` answered `ok`, but the database had no tables: every page would have failed.

**Investigation:**
- The same script had succeeded twice earlier that day, so the script itself was not the first suspect; something under it had changed. `npx --no-install` refusing and offering to download an unrelated prisma version meant the local `prisma` binary was gone.
- `ls /opt/peopleops/current/tools/node_modules/.bin` → no such directory. `ls -la tools/` showed why: `node_modules`, `package.json` and `package-lock.json` were **symlinks** to `/opt/peopleops/releases/3d6304d/tools/…`, an early release.
- That release had been deleted an hour earlier by the new release-retention step (keep the newest three). Every later release had copied `tools/` from the previous one with `cp -a`, which preserves symlinks, so all of them pointed at `3d6304d`.

**Root cause:** release directories were not self-contained (symlinks into an older release), and the pruning step assumed they were. The reset script then made it worse by dropping the schema before checking that it could rebuild it, and by starting the app on an empty database.

**Fix:**
- Immediate: rebuilt `tools/` as a real directory from the current repository (`prisma/`, the two date helpers, pinned `prisma`, `@prisma/client`, `tsx`, `bcryptjs`), ran `prisma generate`, re-ran the reset: seed checks 22/22, site back.
- `deploy/reset-demo.sh`: a **preflight** before the backup and the drop (prisma, tsx, the generated client and the seed files must all be present, or nothing is touched); and if any step after the drop fails, the trap **restores the backup it has just taken** before starting the app, instead of starting it on an empty schema.

```bash
restore() {
  docker exec -i peopleops-postgres pg_restore -U peopleops -d peopleops --clean --if-exists --no-owner < "$BACKUPS/before-reset-$TS.dump" || true
  systemctl start peopleops
}
trap restore ERR
```

**Verification:** the restore command was run against a scratch database in the same container from that run's backup (row counts matched); the next reset ran with the preflight and passed 22/22.

**Prevention:** releases must be self-contained (`find <release> -lname '/opt/peopleops/releases/*'` must be empty before pruning, recorded in DEPLOY.md); destructive maintenance checks its tools before it destroys anything, and every destructive step has an automatic way back.

