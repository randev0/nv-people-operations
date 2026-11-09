# Exploratory test run — 2026-11-10

Goal: use the app like a person trying to break it, note every bug and gap to fix next, and check error handling.

**How:** Chromium, driven by Playwright, against a fresh local copy of the app and seeded database (so destructive tests could not touch live data), plus read-only checks of the live site. All five demo roles were used.

Coverage:
- Crawled every page reachable by each role (HR 60 pages, manager 40, employee 17, IT owner 17) and clicked every non-destructive button on each.
- Tampered with URLs, forms and API bodies.
- Ran two tabs at once, expired the session, went offline, slowed the network, faked server 500/502 responses, stopped the database mid-session and tested the 390 px phone layout.

## Error handling: what exists

| Layer | In place |
| --- | --- |
| API | Every route goes through one wrapper (`src/server/http.ts`). It gives each request an id, rejects cross-origin writes (403 BAD_ORIGIN, verified with curl: foreign, missing and look-alike origins) and returns one error shape: `{error: {code, message, fieldErrors?}, requestId}`. Status codes: 400 validation (zod, per field), 401, 403, 404 (also used to hide other people's records), 409 stale version, 422 domain rule or invalid transition, 429 rate limit, 503 health when the database is down. Unknown errors are logged without request bodies and answered with a generic 500. |
| Client | `api()` turns errors into readable text: "Network error. Check your connection and try again.", "Someone else changed this record…" (and refreshes the page), "Request failed (502)" for non-JSON errors. Forms keep what the user typed, show the error and re-enable the button. Submit buttons disable while pending ("Submitting…"). |
| Pages | The `(app)` group has an error boundary (try again / dashboard) and a not-found page. Pages validate query parameters with `safeParse`, so garbage values such as `?status=BOGUS`, `?page=-5` or `?pageSize=100000` fall back to defaults instead of crashing. |
| AI | Failures never block work. Unconfigured, timeout, invalid output and rate limit are stored as FAILED and shown as advisory, and assignment still works by hand. |
| Recovery | After the database came back, pages and the API recovered on their own without a restart. |

Gaps are listed below as E1–E6.

## Findings to fix

Severity:
- **High:** wrong data, or a dead end for users.
- **Medium:** misleading behaviour or a missing safeguard.
- **Low:** polish or accessibility.

### High

| # | Area | What happens | Expected |
| --- | --- | --- | --- |
| H1 | Bulk assign | Someone assigned a request in another session after it was selected on the dashboard. Bulk assign then reported "Assigned 11 of 11" and silently reassigned it. The bar re-reads each request's version just before assigning, so the version check can never catch a change made by someone else. | Only assign requests that are still unassigned, using the version the user saw. Report the others as "already assigned to X". |
| H2 | AI suggestion | Pressing Refresh past the AI rate limit (14 times in a minute) overwrites a good stored suggestion with FAILED / RATE_LIMITED, so the useful suggestion is lost. | Keep the last good suggestion. Show "Try again in a minute" without touching what is stored. |
| H3 / E1 | Error pages | If the root layout or the session lookup fails (tested by stopping the database), users get Next.js's unstyled "This page couldn't load… ERROR 559290904" page, and a React #441 page error appears. `/login` fails the same way. There is no `global-error.tsx`, and `(app)/error.tsx` cannot catch failures in its own layout. | Add a branded global error page with the request reference and a way to retry, plus an error boundary for the sign-in page. |
| H4 / E2 | 404 | Unknown URLs outside the app (`/this-does-not-exist`, `/api/nope`, and on the live site) show Next's bare "404 This page could not be found." page, with no styling and no link back. | Add a root `not-found.tsx` with the app's look and links to the dashboard and sign-in. Make `/api/*` 404s return the JSON error shape. |

### Medium

| # | Area | What happens | Expected |
| --- | --- | --- | --- |
| M1 / E3 | Validation text | Forms show developer messages straight from the validation library: "Too small: expected string to have >=3 characters", "Too small: expected array to have >=1 items", "Invalid email address", and a generic "Invalid input." banner on top. Seen on new request, employee create/edit, template editor and login (an empty submit shows only "Invalid input."). | Plain, field-specific messages ("Title needs at least 3 characters", "Add at least one task"), with the form's own required/length hints before submitting. |
| M2 | Employees | HR can disable a person who still has open assigned requests and owns onboarding tasks (tested with it.owner). The work stays assigned to someone who can no longer sign in, with no warning. | Warn and list the open work, or block until it is reassigned. Do the same when changing role. |
| M3 | Session expiry | After the session expires, actions show "Sign in to continue." with no link. Navigating redirects to `/login`, and after signing in the user lands on the dashboard instead of where they were. Typed form data is lost if they navigate away. | Offer a sign-in link or redirect with a return path (`/login?next=…`). Return the user to the page they were on. |
| M4 | Requests | Comments can still be added to a Closed request (201). Starting a closed request is correctly refused. | Closed requests are read-only, or a comment reopens the request deliberately. |
| M5 | Template editor | Removing a task that other tasks depend on silently drops those dependencies. For example, removing "Confirm employment details" left laptop, account, policies and payroll with no prerequisite. The new version saved with no warning. | Show which tasks lose a prerequisite, and confirm before saving. |
| M6 | Templates | A new template can reuse an existing template's name, which gives two identical entries in the assign picker. | Reject duplicate names, or ask the user to confirm. |
| M7 | Employees | The joining date accepts 2099-12-31 (and far-past dates). The assign wizard then offers this person and computes deadlines in 2099. | Keep the date within a sensible range (for example, up to 1 year ahead) and flag far-future starts in the wizard. |
| M8 | Requests | When two tabs act on the same request, the stale tab gets "Cannot start a request that is IN_PROGRESS." This is the raw status value, and the page is not refreshed. | "Someone already started this request" with the page refreshed, as the stale-version path already does. |
| M9 | Live security headers | The live site sends no `Strict-Transport-Security` and no `Content-Security-Policy`, and nginx shows its version (`nginx/1.24.0 (Ubuntu)`). | Add HSTS and a CSP that allows the app's own scripts and fonts, and set `server_tokens off`. |
| M10 | Login lockout | After 10 wrong passwords from one address, the real owner is locked out at that address for the whole window, and the message does not say for how long. This limit is intended; the message is the gap. | Say "Try again in N minutes". Optionally let HR clear a lock. |

### Low

| # | Area | What happens | Expected |
| --- | --- | --- | --- |
| L1 | Accessibility | Success messages on the request page ("Assigned to …", "Request resolved") are plain text with no `role="status"`, so screen readers do not announce them. Saving a template redirects with no confirmation at all. | Announce outcomes, and show "Template saved (version N)". |
| L2 | Mobile | The navigation drawer opens with the menu button but does not close with Escape. | Escape closes it and returns focus to the menu button. |
| L3 | Requests list | A page past the end (`?page=50`) shows "Nothing here yet. Requests you can see will appear in this queue.", which suggests there are no requests at all. | "No requests on this page" with a link to page 1. |
| L4 | Forms | Text over the limit is cut off silently by the browser (a 20,000-character comment became 3,000; a 15,000-character description became 5,000). | Show a character counter near the limit. |
| L5 / E4 | Error reference | 500 responses include a `requestId`, but the UI only says "Something went wrong." | Show "Reference: …" so a user can quote it to support. |
| L6 / E5 | Logging | Every signed-out page view is logged as `⨯ Error [AppError]: Sign in to continue.` with a stack trace, which hides real errors in the logs. | Treat 401/403/404 on pages as expected (redirect or not-found) and keep error logs for real failures. |
| L7 | Not found status | Invalid ids inside the app (`/requests/not-a-uuid`, `/templates/0000…`) show the right "Not found" message, but with HTTP 200. | Return 404 via `notFound()`. |
| L8 / E6 | Monitoring | There is no client-side error reporting and no alerting. Errors are only visible in `journalctl`. | Optional for the assessment: a simple error-report endpoint or hosted error tracking. |
| L9 | Policy question | A Facilities request can be assigned to anyone active (for example, a Marketing employee); the picker lists them under "Everyone else". This may be intended. | Confirm the rule: any active person, or only the category's team plus managers and HR. |

## Checked and working

- **Sign-in:**
  - Wrong, unknown and SQL-like credentials all give the same message.
  - Email matching ignores case and surrounding spaces.
  - Logging in is rate limited (429 after 10 tries).
  - The session cookie is HttpOnly and SameSite=Lax (Secure over HTTPS).
  - Signed-out users are sent to `/login` from every page; a garbage cookie or the Back button after signing out does not get back in.
  - The API returns 401 JSON without a session.
- **Permissions:**
  - An employee asking for `scope=all` or `scope=team` gets 403.
  - Someone else's request, its comments and its events all return 404, both on the page and via the API.
  - A requester cannot start, resolve or assign their own request.
  - HR cannot change a task owned by someone else.
  - Employee edits that would create a reporting cycle, make someone their own manager, set a non-manager as manager, demote or disable someone with direct reports, use a bad date or add unknown fields are all rejected.
  - Duplicate emails are rejected regardless of letter case.
- **Input safety:**
  - HTML and script payloads in titles, descriptions, comments and searches are shown as text; nothing executed.
  - Unknown or extra fields, wrong types, arrays and broken JSON give clean 400s.
  - PATCH and DELETE on requests give 405.
- **Robustness:**
  - Triple-clicking submit created one request.
  - Offline and HTTP 500/502 responses show clear messages and keep the form usable.
  - On a slow network the button shows "Submitting…" and is disabled.
  - The assign panel's stale handling works.
  - Pages recover by themselves after a database outage.
- **Crawl:** no server errors, no browser page errors and no error-boundary hits on any page for any role. Every page has a heading. No horizontal overflow at 390 px (wide tables scroll inside their own container).

## Fix status (2026-11-10, same day)

| # | Status | What changed |
| --- | --- | --- |
| H1 | Fixed | Bulk assign re-reads each request and skips any that is no longer unassigned ("Skipped, someone else got there first: … already assigned to X"); it never reassigns. |
| H2 | Fixed | A rate-limited or failed Refresh keeps the stored READY suggestion and answers 503 "previous suggestion is kept; try again in a minute". |
| H3 / E1 | Fixed | `src/app/error.tsx` (sign-in page and signed-in layout failures) and `src/app/global-error.tsx` (root layout) show a branded "We can't load this right now" with a reference and Try again. Failures are reported to the server log. |
| H4 / E2 | Fixed | Root `not-found.tsx` (branded, links to dashboard and sign-in); `/api/*` unknown paths answer JSON 404. |
| M1 / E3 | Fixed | Validation messages are written in plain words in one place (`friendlyIssue` in `src/server/http.ts`): "Needs at least 3 characters.", "This field is required.", "Add at least one.", "Enter a valid email address."; banner "Some fields need attention.". Login checks empty fields itself and treats malformed input as a wrong password. |
| M2 | Fixed | Disabling someone with open requests or onboarding tasks asks for a colleague in the same team ("Hand open work over to"); requests are reassigned (REASSIGNED events) and tasks change owner in one transaction. |
| M3 | Fixed | Signed-out page visits go to `/login?next=…` and return there after sign-in (same-site paths only). When the session ends mid-task, a banner offers "Sign in again" in a new tab, so typed text is kept. |
| M4 | Fixed | Closed requests refuse comments (422 REQUEST_CLOSED) and the page shows a note instead of the comment box. |
| M5 | Fixed | Removing a task that others depend on asks for confirmation and then lists which tasks lost the prerequisite. Saving shows "Saved "…" (version N)". |
| M6 | Fixed | Template names are unique (case-insensitive), 422 DUPLICATE. |
| M7 | Fixed | Joining date must be between 1970 and one year ahead. |
| M8 | Fixed | Out-of-order actions read "This request is already in progress, so it can't be started now. The page has the latest state." and the page refreshes. |
| M9 | Fixed | Nonce-based Content-Security-Policy on every page (`src/proxy.ts`; the root layout renders per request so even 404s carry the nonce); HSTS on HTTPS; nginx `server_tokens off` and HSTS at the proxy. |
| M10 | Fixed | Lock-out message: "Too many sign-in attempts. Try again in N minutes, or ask your HR admin." |
| L1 | Fixed | Request-page outcomes have `role="status"`; template save confirmation added. |
| L2 | Fixed | Escape closes the phone menu and returns focus to the menu button. |
| L3 | Fixed | Past-the-end pages say "No requests on page N" with "Go to page 1". |
| L4 | Fixed | Character counters appear near the limit on title, description and comments. |
| L5 / E4 | Fixed | Server errors show "Reference: …" (first 8 characters of the request id); error pages show the digest. |
| L6 / E5 | Fixed | Pages use `requirePageUser`, which redirects instead of throwing, so signed-out views no longer log errors. |
| L7 | Kept | In-app "Not found" pages still return HTTP 200: the signed-in area streams its loading skeleton (`loading.tsx`), which sends the status line before the page knows the record is missing. Removing the skeleton would fix the code but slow every page; the content and `noindex` are correct. |
| L8 / E6 | Fixed (basic) | Browser errors (error boundaries, uncaught errors, unhandled rejections) are posted to `/api/client-errors` and logged as `client.error` JSON lines next to server errors. No third-party tracker. |
| L9 | Decided and fixed | Only the category's own team can be assigned (IT for IT equipment and software, People & Culture for HR and Other, Facilities for facilities). The picker lists only that team; the server refuses anyone else. A request filed under the wrong category can be moved by an assigner before work starts ("Move to IT equipment" from the AI suggestion), recorded as a comment in the activity. |
