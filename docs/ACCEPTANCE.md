# Acceptance Matrix

States: NOT RUN / PASS / FAIL / BLOCKED. A row is PASS only with a recorded command or scenario and its observed result. Mocked-provider AI tests are recorded separately from the real-provider smoke test.

| ID | Scenario | Expected | State | Date | Commit | Evidence / limitation |
| --- | --- | --- | --- | --- | --- | --- |
| A01 | Login as each documented role; invalid password; logout | Correct user scope; invalid denied; cookie invalid after logout | NOT RUN | | | |
| A02 | Unauthenticated direct API call | 401; no sensitive payload | NOT RUN | | | |
| A03 | Employee A guesses Employee B request ID, comments URL and events URL | 404; no disclosure and no comment inserted | NOT RUN | | | |
| A04 | Manager accesses non-direct-report request or checklist | Denied; department/country membership alone grants nothing | NOT RUN | | | |
| A05 | Request assigned to employee outside requester's team | Assignee can access/work that request only | NOT RUN | | | |
| A06 | Employee submits status/assignee/requester in create payload | Rejected; cannot escalate fields | NOT RUN | | | |
| A07 | Non-assignee starts/resolves request; skip SUBMITTED→CLOSED | Denied without mutation/history entry | NOT RUN | | | |
| A08 | Correct assignment→start→resolve→close | Valid states, history, actors and timestamps persist | NOT RUN | | | |
| A09 | Two simultaneous transitions with same version | Exactly one succeeds; other 409; no duplicate event | NOT RUN | | | |
| A10 | Employee tries HR API or dashboard directly | 403; UI hiding is not the test | NOT RUN | | | |
| A11 | Disabled user with previously valid session | Access denied; no stale role/session bypass | NOT RUN | | | |
| O01 | HR creates/edits template through UI | Valid persisted template; version increments | NOT RUN | | | |
| O02 | Self-edge, cycle, missing prerequisite, cross-template edge | 422; template stays valid | NOT RUN | | | |
| O03 | Assign template with one missing owner | 422; no partial onboarding/tasks | NOT RUN | | | |
| O04 | Assign twice; concurrent duplicate assignment | One checklist only; conflict reported | NOT RUN | | | |
| O05 | Edit template after assignment | Existing employee snapshot unchanged | NOT RUN | | | |
| O06 | Start or complete a task before prerequisites complete | Denied; shows blocking prerequisite | NOT RUN | | | |
| O07 | Owner completes prerequisite then starts dependent | Dependent becomes available without manual unblock | NOT RUN | | | |
| O08 | New hire tries to complete task assigned to IT | Denied; IT owner can complete via My Work | NOT RUN | | | |
| O09 | Task owner reads another hire's full checklist | Denied unless independent manager/HR scope exists | NOT RUN | | | |
| O10 | Day 1/7/30 from joining date, month/year boundary, Cyprus DST | Correct calendar dates and consistent overdue labels | NOT RUN | | | |
| O11 | Local due date still today vs next local day | Not overdue today; overdue next day if incomplete | NOT RUN | | | |
| O12 | Final two tasks completed concurrently | All complete and onboarding.completedAt set correctly | NOT RUN | | | |
| D01 | Fresh seed; seed twice | Required counts and same totals after rerun | NOT RUN | | | |
| D02 | Dashboard headcount | Four countries ×25 =100; database-derived | NOT RUN | | | |
| D03 | Resolve request; complete overdue task | Dashboard and detail totals update consistently | NOT RUN | | | |
| D04 | Cross-module insight | Lists seeded recent hires and actual open IT request links | NOT RUN | | | |
| AI01 | Real provider valid description | Valid database category/team/person IDs; visible explanation | NOT RUN | | | |
| AI02 | Provider timeout/missing key/invalid JSON/unknown ID | Helpful error, preserved draft, manual submission works | NOT RUN | | | |
| AI03 | Prompt injection requesting secrets/admin assignment | No secret exposure or unauthorized action; constrained response | NOT RUN | | | |
| AI04 | Rate limit reached | 429 without unbounded provider calls | NOT RUN | | | |
| U01 | Narrow viewport, keyboard, loading/empty/error states | Usable screens with labels/focus; no horizontal obstruction | NOT RUN | | | |
| P01 | Fresh browser opens deployed URL and logs in | No local-only URL, missing assets or authentication redirect loop | NOT RUN | | | |
| P02 | New comment/request persists after reload/restart | Real persistent database storage | NOT RUN | | | |
| P03 | Repository/env/build output review | No API/session/database secrets or production data committed | NOT RUN | | | |
| P04 | Clean installation/build/lint/typecheck/test | Commands and actual results recorded; failures not hidden | NOT RUN | | | |

## Command log

| Date | Command | Result |
| --- | --- | --- |
