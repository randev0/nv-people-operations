# Build Plan

Deadline/timezone from the invitation: **not yet supplied** (working timezone Asia/Kuala_Lumpur).

| Phase | Work | Gate | State |
| --- | --- | --- | --- |
| 0 Design | Read pack; review donor; write ARCHITECTURE, contracts, permissions, reuse, acceptance, CLAUDE.md, DEBUG_LOG | Docs cover both modules, field dictionary, endpoints, roles, states, trade-offs; committed | In progress |
| 1 Foundation | Next.js skeleton, UI imports, Prisma schema + migration, login/me/logout, permissions, minimal seed | build + typecheck pass; role logins work; unauthenticated APIs 401 | Not started |
| 2 Requests | Create/list/detail/comments/events; assign + state machine; filters | Submitted→Closed flow and negative ownership/state tests pass | Not started |
| 3 Onboarding | Template editor + DAG; employees; assignment snapshots; My Work; dates/progress | HR creates+assigns template; owners execute; dependency/timezone tests pass | Not started |
| 4 Dashboard + AI | Aggregates, chart, cross-module insight; AI router UI | Dashboard reconciles with data; real LLM returns valid suggestion; failures keep manual submit | Not started |
| 5 Seed + integration | 100 employees, 40 requests, 8 onboardings; e2e; responsive polish | Seed verify + idempotency; e2e scenarios pass | Not started |
| 6 Deployment | Host + isolated DB; migrate; seed once; smoke tests | Public URL works per role; AI live; persistence | Not started |
| 7 Submission | Reconcile docs; DEBUG_LOG; README; limitations | Checklist complete or gaps disclosed | Not started |

## Blockers

| Blocker | Impact | Needed from candidate |
| --- | --- | --- |
| Session egress policy blocks `registry.npmjs.org` (proxy 403) in cloud workspace and local VM | Cannot install dependencies → cannot build, typecheck or test | Allow npm registry (+ `binaries.prisma.sh` for Prisma engines) in Claude network settings, or another install route |
| No Anthropic API key / model id | Live AI acceptance (AI01, P-phase) cannot pass | Key + model id set on host only |
| No hosting target, isolated Postgres, GitHub repo | Phase 6 cannot run | Choice of host/DB in candidate's accounts; new empty repo URL |
