# CLAUDE.md — project rules

This is a separate Next Ventures assessment application. The assessment PDF and approved design are the product requirements. Existing EraCare repositories are read-only donors, never deployment targets.

Implement in bounded phases. Before application code, write architecture and contracts. Keep documentation consistent with code. Centralize server permissions and workflow checks; UI controls are not authorization. Validate inputs and outputs. Use transactions for related writes and version checks for concurrent edits. Never bypass tests, fabricate data-backed metrics, invent debug logs or report unrun checks as passed.

Reuse only recorded components (docs/REUSE_MANIFEST.md). No production data, secrets, migrations, deployment scripts, email polling or extra ITSM modules. Use isolated application and test databases. AI is advisory and server-only. Preserve functionality during provider failures.

Record genuine debugging as it happens (WORKLOG.md raw notes → DEBUG_LOG.md for the three most significant). Do not end with a plan when implementation is possible. Ask only for missing external credentials/destinations or genuinely blocking ambiguity. Report limitations candidly.

## Where things live

- Permissions: `src/server/auth/permissions.ts` (single source; list scoping and detail checks share predicates)
- Request state machine: `src/server/requests/state-machine.ts`
- Onboarding dates/overdue: `src/server/onboarding/dates.ts`; DAG validation: `src/server/onboarding/dependencies.ts`
- Error envelope / handler wrapper: `src/server/http.ts`

## Commands (verified 2026-11-09)

- `npm run typecheck`, `npm run lint`, `npm run build`
- `npm run test:unit` (node:test via tsx, `--conditions=react-server` so `server-only` modules load)
- `npm run test:integration` / `npm run test:e2e` — need `npm run build` first and `TEST_DATABASE_URL`; they create and drop their own per-run database. Never use `prisma migrate reset` against any database.
- `npm run db:migrate` (migrate deploy), `ALLOW_ASSESSMENT_SEED=true npm run db:seed`, `npm run db:verify-seed`
- In the Claude cloud workspace npm must go through the agent proxy: prefix with `npm_config_noproxy= NO_PROXY= no_proxy=`. Stop stale servers with `pkill -f next-server`.
