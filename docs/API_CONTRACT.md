# API Contract

Base URL `/api`. JSON in and out. All routes except `POST /auth/login` and `GET /health` require a valid session. All mutating routes require an `Origin` header matching `APP_URL`.

## Envelopes

- Single object: `{ "data": DTO }`
- List: `{ "data": DTO[], "meta": { "page", "pageSize", "total" } }`
- Logout: `204` no body.
- Error: `{ "error": { "code", "message", "fieldErrors"? }, "requestId" }`

| Status | Code(s) | Meaning |
| --- | --- | --- |
| 400 | `BAD_REQUEST`, `VALIDATION_FAILED` | malformed JSON/query, schema failure, unknown fields |
| 401 | `UNAUTHENTICATED` | no/invalid/stale session |
| 403 | `FORBIDDEN`, `BAD_ORIGIN` | visible record but action not allowed; origin mismatch |
| 404 | `NOT_FOUND` | missing or outside read scope |
| 409 | `STALE_VERSION`, `ALREADY_ASSIGNED`, `DUPLICATE` | concurrency or uniqueness conflict |
| 422 | `INVALID_TRANSITION`, `DOMAIN_RULE`, `PREREQUISITES_INCOMPLETE`, `DEPENDENCY_CYCLE` | domain validation |
| 429 | `RATE_LIMITED` | login or AI throttle |
| 503 | `AI_UNAVAILABLE`, `AI_INVALID_OUTPUT`, `UNAVAILABLE` | provider down/unconfigured/invalid; health failure |
| 500 | `INTERNAL` | unexpected; generic message only |

Write schemas are `strict()` — unknown keys (e.g. `status`, `assigneeId`, `requesterId` on create) are rejected with 400.

Pagination: `page` ≥1 default 1, `pageSize` 1–100 default 20. Ordering is deterministic (timestamp then id).

## DTOs

- **UserSummary** `{id, name, role, countryCode, department:{id,name}}`
- **EmployeeDTO** = UserSummary + `{email, managerId, manager:{id,name}|null, joiningDate (YYYY-MM-DD), employmentStatus, loginEnabled}`. Never `passwordHash`/`sessionVersion`.
- **RequestDTO** `{id, number, title, description, category:{id,code,name}, priority, status, requester:UserSummary, assignee:UserSummary|null, version, createdAt, updatedAt, resolvedAt, closedAt, allowedActions: ("ASSIGN"|"REASSIGN"|"START"|"RESOLVE"|"CLOSE"|"COMMENT")[]}`
- **CommentDTO** `{id, body, author:{id,name}, createdAt}`
- **RequestEventDTO** `{id, kind, fromStatus, toStatus, actor:{id,name}, previousAssignee:{id,name}|null, newAssignee:{id,name}|null, createdAt}` (adds names alongside the pack's ids for display; ids are inside the objects)
- **TemplateTaskDTO** `{key, title, description, departmentId, dueDay, sortOrder, prerequisiteKeys:string[]}`
- **TemplateDTO** `{id, name, description, isActive, version, updatedAt, tasks:TemplateTaskDTO[]}`
- **TaskDTO** `{id, onboardingId, title, description, department:{id,name}, owner:UserSummary, dueDay, dueDate, status, effectiveStatus, isOverdue, version, prerequisites:[{id,title,status}], allowedActions:("START"|"COMPLETE")[]}`; in My Work also `hire:{id,name,department:{id,name}}`.
- **OnboardingSummary** `{id, employee:UserSummary, startDate, timezone, templateName, completedAt, progress:{total,completed,pending,inProgress,blocked,overdue,percent}}`
- **OnboardingDTO** = OnboardingSummary + `{tasks:TaskDTO[]}`
- **RequestSuggestionDTO** `{status: PENDING|READY|FAILED|NONE, category:{id,code,name}|null, priority|null, suggestedDepartment:{id,name}|null, suggestedAssignee:{id,name,department}|null, explanation|null, failureReason|null (human text), updatedAt|null, canRegenerate}`. `POST /requests` triggers generation after the response is sent; the request itself is never modified.
- **RouterDTO** `{categoryId, priority, suggestedDepartmentId, suggestedAssigneeId:string|null, suggestedAssigneeName:string|null, explanation, needsReview:true}` (name added so the advisory person can be shown; it is a candidate the server already validated)

## Endpoints

| Method/path | Input | Output | Authorization |
| --- | --- | --- | --- |
| POST /auth/login | `{email,password}` | `{data:{user:EmployeeDTO}}` + cookie | Public; throttled; origin checked |
| POST /auth/logout | — | 204, cookie cleared | Session; origin checked |
| GET /auth/me | — | EmployeeDTO | Authenticated |
| GET /countries | — | `[{code,name,timezone}]` | Authenticated |
| GET /departments | — | `[{id,name}]` | Authenticated |
| GET /request-categories | — | `[{id,code,name,defaultDepartmentId}]` | Authenticated |
| GET /employees | `page,pageSize,q,countryCode,departmentId,employmentStatus` | Paginated EmployeeDTO | HR all; Manager self + direct reports; Employee 403 |
| POST /employees | `{name,email,initialPassword,role,countryCode,departmentId,managerId,joiningDate,employmentStatus}` | EmployeeDTO 201 | HR |
| GET /employees/:id | — | EmployeeDTO | Self, direct manager, HR (else 404) |
| PATCH /employees/:id | subset `{name,role,countryCode,departmentId,managerId,joiningDate,employmentStatus,loginEnabled}` | EmployeeDTO | HR; reporting rules validated |
| GET /employees/manager-options | — | UserSummary[] (login-enabled MANAGER/HR) | HR (for employee form) |
| GET /requests | `page,pageSize,q,status=SUBMITTED\|ASSIGNED\|IN_PROGRESS\|RESOLVED\|CLOSED\|OPEN,categoryId,priority,countryCode,scope=mine\|team\|assigned\|all,insight=new-hires-it,resolved=last-7-days,sort=newest\|priority` | Paginated RequestDTO | `team` Manager/HR only, `all` HR only, else 403. `status=OPEN` = submitted, assigned or in progress. `insight=new-hires-it` (HR and managers, employees 403) narrows to the requests behind the dashboard's equipment queue, using the same server function. `sort=priority` orders urgent → low, then oldest first (the dashboard's Assign requests order); default `newest`. `resolved=last-7-days` = resolvedAt within the rolling 7×24 h ending now (whatever the current status). All scope rules still apply |
| POST /requests | `{title,description,categoryId,priority}` | RequestDTO 201 | Any; requester = session user |
| GET /requests/:id | — | RequestDTO | Read policy |
| GET /requests/:id/comments | `page,pageSize` | Paginated CommentDTO (oldest first) | Read policy |
| POST /requests/:id/comments | `{body}` | CommentDTO 201 | Read policy |
| GET /requests/:id/events | `page,pageSize` | Paginated RequestEventDTO | Read policy |
| GET /requests/:id/ai-suggestion | — | RequestSuggestionDTO | Read policy; `suggestedAssignee` only for users who can assign |
| POST /requests/:id/ai-suggestion | — | RequestSuggestionDTO (regenerated synchronously) | canAssignRequest, request SUBMITTED/ASSIGNED; AI rate limit |
| GET /requests/:id/assignee-options | `q?,departmentId?` | UserSummary[] ≤100 | canAssignRequest |
| POST /requests/:id/assign | `{assigneeId,expectedVersion}` | RequestDTO | Assignment policy + state machine |
| POST /requests/:id/transition | `{action:START\|RESOLVE\|CLOSE,expectedVersion}` | RequestDTO | Transition policy |
| GET /onboarding-templates | `page,pageSize,active?` | Paginated TemplateDTO | HR |
| POST /onboarding-templates | `{name,description,tasks}` | TemplateDTO 201 | HR; DAG validated |
| GET /onboarding-templates/:id | — | TemplateDTO | HR |
| PUT /onboarding-templates/:id | `{name,description,isActive,tasks,expectedVersion}` | TemplateDTO | HR; atomic replace; version+1 |
| GET /onboarding | `page,pageSize,countryCode,progress=active\|completed` | Paginated OnboardingSummary | Own / direct reports / all |
| GET /onboarding/assignment-options | `employeeId,templateId` | `{templateVersion,startDate,timezone,tasks:[{key,title,departmentId,dueDay,dueDate,eligibleOwners:UserSummary[],suggestedOwnerId?}]}` | HR |
| GET /onboarding/unassigned-employees | `q?` | UserSummary[] ≤100 without an onboarding | HR (for assignment dialog) |
| POST /onboarding | `{employeeId,templateId,expectedTemplateVersion,owners:[{taskKey,ownerId}]}` | OnboardingDTO 201 | HR; atomic |
| GET /onboarding/:id | — | OnboardingDTO | Own / direct manager / HR |
| GET /my-work | `page,pageSize,kind=request\|task,status?,overdue?` | Paginated RequestDTO or TaskDTO+hire | Current user's assignments |
| POST /onboarding-tasks/:id/transition | `{action:START\|COMPLETE,expectedVersion}` | TaskDTO | Task owner |
| GET /onboarding-tasks/:id/events | `page,pageSize` | Paginated `{id,fromStatus,toStatus,actor:{id,name},createdAt}` | Owner or checklist read scope |
| GET /dashboard | — | DashboardDTO; also `requestFlow` (aging by status, `backlog` = open count at the end of each UTC day for 30 days with the last point at `asOf`, rolling 7-day `windows` with opened/resolved counts), `offices` (headcount, active onboardings), `overdueTasks` (every overdue onboarding task, most overdue first), `equipmentQueue` (one row per open IT request from a recent hire, oldest first) | HR |
| GET /dashboard/mine | — | `{myOpenRequests,myAssignedRequests,myPendingTasks,myOverdueTasks,myOnboardingProgress?,team?}` | Authenticated; `team` for Manager |
| POST /ai/route-request | `{title (3–160), description (10–5000)}` | RouterDTO | Authenticated; 10/min/user |
| GET /health | — | `{status:"ok"}` or 503 | Public |

Endpoints added beyond the pack (`/employees/manager-options`, `/onboarding/unassigned-employees`) are narrow HR-only lookups needed by the UI forms; they return UserSummary only.

### DashboardDTO

```json
{
  "headcountByCountry": [{"countryCode":"MY","count":25}],
  "openRequests": {"total":0,"byStatus":[{"status":"SUBMITTED","count":0}],"byCategory":[{"code":"IT_EQUIPMENT","name":"IT equipment","count":0}]},
  "onboarding": {"activeHires":0,"overdueTasks":0},
  "newHiresWithOpenITRequests": [{"employeeId":"uuid","name":"…","countryCode":"MY","requestIds":["uuid"],"requestNumbers":[12],"openRequestCount":1}],
  "asOf":"ISO timestamp"
}
```

Values shown are shape only. Open = SUBMITTED/ASSIGNED/IN_PROGRESS. Headcount counts all employees. Insight = joined within 60 days before `asOf` (in UTC date terms), has an onboarding, has ≥1 open IT_EQUIPMENT request.
