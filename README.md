# People Operations

An HRIS module for Next Ventures, built for the HRIS Systems Developer assessment. It covers one organisation with about 100 people in Bangladesh, Malaysia, Sri Lanka and Cyprus, and has two modules on shared users and authentication:

- **Service requests**: IT equipment, software access, HR queries, facilities and other requests. Each moves through Submitted → Assigned → In progress → Resolved → Closed, with comments and an append-only history.
- **Onboarding**: HR builds checklist templates with team-owned tasks, calendar deadlines and prerequisites, then assigns one to a new hire with an owner for every task. Owners work their tasks from **My Work**. Blocked and overdue states are derived, not stored.
- **Dashboard**: an HR view with headcount, open requests by status and category (bar charts with text values), active onboardings, overdue tasks, and one cross-module insight: new hires still waiting on IT equipment. Everyone else gets a personal dashboard; managers also see their team.
- **AI request router** (the AI feature): suggests a category, priority, team and optionally a person for a draft request. The suggestion is advisory only. It never submits, assigns or approves anything, and manual submission works when AI is unavailable.

Design and rules: **[ARCHITECTURE.md](ARCHITECTURE.md)**. API: [docs/API_CONTRACT.md](docs/API_CONTRACT.md). Permissions: [docs/PERMISSIONS.md](docs/PERMISSIONS.md). Test evidence: [docs/ACCEPTANCE.md](docs/ACCEPTANCE.md). Bugs: [DEBUG_LOG.md](DEBUG_LOG.md).

## Live URL

**https://peopleops.77-42-88-180.sslip.io** — deployed 2026-11-09 on a VPS (systemd + nginx + Let's Encrypt, isolated PostgreSQL). Source: https://github.com/randev0/nv-people-operations.

The AI router is deployed but **not yet enabled on the live site** (provider set to OpenAI `gpt-6.1-sol`; waiting for an OpenAI API key); it shows "AI suggestions are not configured" and manual submission works. See [deploy/DEPLOY.md](deploy/DEPLOY.md).

## Demo accounts

All data is synthetic (`example.com`). The shared demo password is **`PeopleOps-Demo-2026!`**. It is disposable, set through `DEMO_PASSWORD`, and used only for this assessment.

| Email | Role | What to try |
| --- | --- | --- |
| `hr.admin@example.com` | HR Admin | Dashboard, all requests, employees, templates, assigning checklists |
| `manager.my@example.com` | Manager (Malaysia, Engineering) | Team requests: assign, close. Direct reports' onboarding |
| `employee.my@example.com` | Employee (recent hire) | Own requests, AI suggestion, own onboarding checklist |
| `it.owner@example.com` | Employee in IT | Assigned requests and onboarding tasks across several hires (My Work) |
| `employee.cy@example.com` | Employee (Cyprus) | Unrelated user for negative access checks |

A second HR admin, `hr.ops@example.com`, also exists.

## Five-minute walkthrough

1. **employee.my**: Requests → New request. Type a laptop problem and click **Suggest routing**. Without an API key you'll see "AI suggestions are not configured", and your draft is kept. Submit manually. Then open **My Onboarding**: blocked tasks show what they're waiting on, and overdue tasks are flagged.
2. **manager.my**: Requests → *My team* tab. Open the new request and assign it to an IT person (for example Priya Ismail, it.owner). Try a request ID from another team: you get 404.
3. **it.owner**: My Work → complete **Create company account**. *Hand over laptop* becomes startable straight away. Assigned requests → start, comment, resolve.
4. **employee.my**: close the resolved request.
5. **hr.admin**: Dashboard (the cross-module list links to the actual requests) → Templates → New template (try a prerequisite loop to see the warning) → Onboarding → Assign checklist (deadlines are calculated per task, and each task needs an owner) → Employees (create, edit, disable login).

## Local setup

Requirements: Node.js ≥ 20.9 (tested with 22.23), PostgreSQL 14+ (tested with 16), npm.

```bash
npm ci
cp .env.example .env            # then edit values, see below
npm run db:generate
npm run db:migrate              # prisma migrate deploy (never resets data)
ALLOW_ASSESSMENT_SEED=true npm run db:seed
npm run db:verify-seed          # asserts the seed contract (22 checks)
npm run build && npm start      # or: npm run dev
```

Environment variables (`.env.example` has placeholders only):

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Isolated assessment database |
| `TEST_DATABASE_URL` | Separate server/database used by the integration and e2e runners. The name must contain `test`. The runner creates and drops its own per-run database there. |
| `SESSION_SECRET` | ≥ 32 random characters (`openssl rand -hex 32`) |
| `APP_URL` | Exact public origin. Mutations must send a matching `Origin`. Cookies are `Secure` when this is `https://`. |
| `AI_PROVIDER` | `anthropic` (default) or `openai` |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` / `OPENAI_API_KEY`, `OPENAI_MODEL` | Server-only credentials for the selected provider (OpenAI: a platform API key, e.g. model `gpt-6.1-sol`). If the key or model is empty, the AI router returns 503 and everything else still works. |
| `DEMO_PASSWORD` | Password given to every seeded account |
| `ALLOW_ASSESSMENT_SEED` | Must be `true` for the seed to run. Turn it off again after seeding. |
| `SEED_REFERENCE_DATE` | Optional `YYYY-MM-DD` for reproducible data (defaults to today) |
| `LOGIN_RATE_LIMIT`, `LOGIN_RATE_WINDOW_MINUTES`, `AI_RATE_LIMIT_PER_MINUTE` | Optional overrides (defaults 10 per 15 min, 10/min) |

The seed is idempotent. It only creates missing fixture rows (deterministic IDs and unique emails), never deletes anything, and doesn't overwrite changes reviewers make. Overdue counts change over time because they are measured against "today" in each hire's timezone.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js development, production build, production server |
| `npm run lint` / `typecheck` | ESLint, `tsc --noEmit` |
| `npm run test:unit` | Pure logic: dates/timezones, DAG validation, permissions, state machine, AI output validation (`node:test`) |
| `npm run test:integration` | Requires `npm run build`. Creates a fresh test database, migrates, seeds, starts the app on :3100 and runs HTTP tests covering authorization, workflows, concurrency, dashboard and AI fallbacks. |
| `npm run test:e2e` | Same harness with Playwright: full request lifecycle, task unblocking, template editor, role navigation, 390 px layout |
| `npm run db:generate` / `db:migrate` / `db:seed` / `db:verify-seed` | Prisma client, `migrate deploy`, seed, seed assertions |

Latest local results (2026-11-09): lint 0 problems, typecheck 0 errors, unit 24/24, integration 24/24, e2e 5/5, seed verification 22/22. See [docs/ACCEPTANCE.md](docs/ACCEPTANCE.md).

## Deployment

Production runs on a shared VPS: Next.js standalone build under systemd as an unprivileged user, a dedicated PostgreSQL container bound to localhost, and nginx with a Let's Encrypt certificate. The full runbook (build, ship, migrate, seed once, rollback, enabling AI) is in **[deploy/DEPLOY.md](deploy/DEPLOY.md)**.

Generic steps for any Node host: set the environment variables above, `npm ci && npm run db:migrate && npm run build`, start with `npm start`, run the seed once with `ALLOW_ASSESSMENT_SEED=true`, then smoke test `/api/health`, each demo login, a request flow, a task flow, the dashboard and an AI suggestion.

## Reuse disclosure

Selected UI primitives, the styling tokens and three layout patterns were adapted from the ERACare platform repository `randev0/eracare-platform` (read-only, commit `1db0431`). Nothing else was reused: no API routes, schema, migrations, deployment scripts or data. Each file is listed in [docs/REUSE_MANIFEST.md](docs/REUSE_MANIFEST.md), and shadcn/ui's MIT notice is in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Known limitations

- Requests and tasks cannot be reopened, cancelled or deleted. Completed onboarding tasks are final.
- Template changes apply to future assignments only. There's no tool to migrate existing checklists.
- Logout signs the user out on all devices (session-version revocation).
- No attachments, email or notifications, password reset or self-service signup (excluded by the brief).
- AI routing accuracy has not been measured. Prompt-injection handling is unit-tested with a mocked provider, but has not been tested against the live model.
- My Work filters blocked/overdue in memory per owner. That's fine for hundreds of tasks per person.
