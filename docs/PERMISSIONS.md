# Permissions

All checks live in `src/server/auth/permissions.ts` and are applied by domain services, never only in the UI. Roles: `EMPLOYEE`, `MANAGER`, `HR_ADMIN`. Department is not a role. "Direct report" = `user.managerId === actor.id`.

## Matrix

| Action | Employee | Manager | HR Admin |
| --- | --- | --- | --- |
| Create request | Self | Self | Self |
| Read request, comments, history | Own or assigned to self | Same + direct reports' requests | All |
| Comment | Any readable request | Same | All |
| Assign / reassign | No | Direct reports' requests (not own) | All |
| Start / resolve | Current assignee only | Same | Same (no admin bypass) |
| Close resolved request | Requester | Requester or requester's direct manager | Any |
| View full onboarding checklist | Own | Own + direct reports | All |
| View owned task on another hire | Task only, minimal hire context (My Work) | Same | All |
| Start / complete onboarding task | Owner only | Owner only | Owner only |
| Templates (create/edit/archive) | No | No | Yes |
| Assign checklist | No | No | Yes |
| Create / edit employees | No | No | Yes |
| Employee list | 403 | Self + direct reports (read-only) | All |
| Organisation dashboard | 403 | 403 (uses `/dashboard/mine` with team) | Yes |
| AI routing suggestion | Own draft; stored suggestion on readable requests without the person | Same; person + refresh on requests they can assign | Same; person + refresh on all open requests |

## Record scoping

- **Requests** read scope (`requestReadScopeWhere`): HR → all; others → `requesterId = me OR assigneeId = me`, plus for managers `requester.managerId = me`. The same predicate backs both list queries and `GET /requests/:id`, `/comments`, `/events`. Outside scope → 404 before any comments/events are loaded or written.
- **Assignee exception:** an assignee outside the requester's team can read, comment on and work that single request; it grants nothing else about the requester.
- **List scopes:** `mine` (requester = me), `assigned` (assignee = me), `team` (requester is my direct report; Manager/HR), `all` (HR). A role requesting a scope it does not hold → 403.
- **Onboarding** read scope: HR → all; others → `employeeId = me`, plus managers `employee.managerId = me`.
- **Task-owner exception:** owners see their tasks in My Work with title, description, due date, status, prerequisite titles/statuses and hire name/department only. They cannot open the hire's full checklist (`GET /onboarding/:id` → 404) unless they independently hold read scope. Task events are readable by the owner or anyone with checklist scope.
- **Who can be assigned:** only active people in the department that handles the request's category (`RequestCategory.defaultDepartmentId`), never the requester. Assigners may move a request to another category before work starts (`POST /requests/:id/category`), which is recorded as a comment; an existing assignee outside the new team must be replaced first.
- **Disabling a login with open work** requires `handOverToId`, an active colleague in the same department; their open requests are reassigned and their onboarding tasks change owner in the same transaction.
- **Lookups:** assignee options and onboarding owner options return UserSummary only (id, name, role, country, department).
- **Employees:** `GET /employees/:id` allowed for self, direct manager, HR; otherwise 404.
- **Precedence:** authentication (401) → read scope (404) → action permission (403) → state/domain rules (422) → version (409).
- **Session integrity:** role is read from the database each request; disabled or session-version-mismatched accounts are rejected with 401.

## Dashboard (2026-11-09)

- **Today work queue** (`src/server/dashboard/work-queue.ts`) is built only from records the viewer can act on, using the shared predicates: task `allowedActions` (owner only), `allowedActionsFor` for requests (START/RESOLVE assignee only; CLOSE requester), and `canAssignRequest` for submitted requests (HR: all; manager: direct reports' requests, never their own). Actions call the existing endpoints, which re-check permissions.
- **Equipment insight filter** `insight=new-hires-it` on `GET /requests`: HR in any scope; managers too, but the list's read scope and list scope still apply, so a manager only gets their team's requests. Employees: 403.
- **Onboarding follow-ups** (`overdueToChase`): HR sees every overdue task, managers only tasks in their direct reports' checklists, employees none; tasks owned by the viewer are excluded. Read-only list; the row opens the checklist, which re-checks read access.
- **Assign sheet**: loads the request and eligible assignees through the same API routes as the record page, so the same 404/403 rules apply.
- **Overdue task list** `/onboarding/overdue`: HR all checklists, managers their direct reports' checklists, employees refused (they use My Work). Rows link to the checklist, which re-checks read access.
- **Bulk assign**: no new endpoint; each request goes through `POST /requests/:id/assign`, so `canAssignRequest`, eligibility and the version check apply per request.
