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

## Commands

Commands are filled in as they are implemented and verified (see README). Until dependencies can be installed, none have been run.
