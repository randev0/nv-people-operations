# Debug Log

Three issues observed during development, written up in the required format. Raw notes are in `WORKLOG.md`.

**Honest classification:** only Bug 1 is a significant application security defect found at runtime. Bug 2 is a real but lower-severity application defect (it only shows when client JavaScript fails to load). Bug 3 is a genuine styling defect inherited from the donor token format; it hid UI feedback but had no security or data impact. No bugs were introduced deliberately and none of these were described before they were observed. Static concerns about the donor repository (missing per-record checks in its ticket routes) are **not** included because they were never reproduced here.

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

**Prevention:** proposed, not implemented: an e2e test with JS disabled asserting no credentials in the URL. Also use `pkill -f next-server` (not `next start`) in local scripts.

---

## Bug 3 — Tailwind opacity classes generated no CSS, so chart bars and hover states were invisible

**Affected commit/date:** `b4c8a08` (first adapted UI primitives) through `9709361`, found 2026-11-09 during the UI redesign.

**Symptom:** reviewing a 1440 px screenshot of the HR dashboard, every bar in the three charts was an empty grey track, while the numbers next to them (8 / 8 / 8 …) were correct.

**Investigation:**
- First hypothesis: zero widths. Ruled out: the text values were non-zero and the DOM showed the inline `style="width: 62%"` on each fill element.
- Second hypothesis: the fill had no colour. Grepped the compiled CSS in `.next/static/css`: `.bg-primary{background-color:var(--primary)}` existed, but `.bg-primary\/85` was absent. So were `hover:bg-primary/90`, `hover:bg-muted/40`, `bg-primary/20` and `bg-destructive/90`.
- Tailwind only emits an opacity-modified colour when it can inject the alpha. The donor mapping `primary: "var(--primary)"` with `--primary` holding a complete colour gives it nowhere to do that, so each `/NN` class was dropped silently, with no build warning.

**Root cause:** the colour-token format adapted from the donor (`tailwind.config.ts`, `src/app/globals.css`) was incompatible with Tailwind opacity modifiers. Since the first UI commit, button hover states, table-row hover, progress-bar tracks and destructive hovers had also been invisible.

**Fix:** (UI redesign commit) tokens are HSL channels (`--primary: 244 52% 44%`) and the config maps `primary: "hsl(var(--primary) / <alpha-value>)"` for every colour.

**Verification:** after rebuilding, the compiled CSS contains `.bg-primary\/85{background-color:hsl(var(--primary) / .85)}`. The dashboard screenshot shows filled bars, and the axe scan (15 pages, 0 violations, which includes colour contrast) still passes.

**Prevention:** proposed, not implemented: a build-time check that greps the compiled CSS for a few known opacity classes.

---

_Earlier draft of this log listed a test-suite isolation defect (integration D03 mutating a shared fixture) as Bug 3. It was a genuine but minor test-only issue and is kept in `WORKLOG.md`._
