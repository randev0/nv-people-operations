# People Operations

An HRIS module built for the Next Ventures **HRIS Systems Developer** technical assessment. It serves one organisation of about 100 people across Bangladesh, Malaysia, Sri Lanka and Cyprus, with two modules on shared users and authentication:

- **Service requests**: IT equipment, software access, HR queries, facilities and other requests. Each moves through Submitted → Assigned → In progress → Resolved → Closed, with comments and an append-only history. Only the category's own team can be assigned.
- **Onboarding**: HR builds checklist templates with team-owned tasks, calendar deadlines and prerequisites, then assigns one to a new hire with an owner for every task. Owners work their tasks from **My Work**. Blocked and overdue states are derived, not stored.
- **Dashboard**: **Today** shows the work that needs the viewer (one list at a time, with live counts and next steps); **Insights** holds the reporting (requests by status and category, headcount by office, onboarding progress, overdue totals, the cross-module IT-equipment insight). Every figure opens the records behind it, and every role gets the same layout scoped to what it may see.
- **AI request router**: on submit, suggests a category, priority, team and person. It is advisory only: it never submits, assigns or approves anything, and everything works when the AI is unavailable.

## For evaluators: where to look

| You want to check… | Go to |
| --- | --- |
| The running system | **https://peopleops.77-42-88-180.sslip.io** (demo accounts below) |
| Design, data model, API, access control, state machines, trade-offs (ADRs) | **[ARCHITECTURE.md](ARCHITECTURE.md)** |
| Each requirement and the evidence that it works | [docs/ACCEPTANCE.md](docs/ACCEPTANCE.md) |
| Who can see and do what | [docs/PERMISSIONS.md](docs/PERMISSIONS.md) |
| Endpoints and payloads | [docs/API_CONTRACT.md](docs/API_CONTRACT.md) |
| The three most significant bugs, debugged step by step (plus four more, same format) | [DEBUG_LOG.md](DEBUG_LOG.md) |
| Dashboard screen design and work-queue ordering | [docs/DASHBOARD.md](docs/DASHBOARD.md) |
| A "try to break it" test run, its findings and how each was fixed | [docs/QA_FINDINGS.md](docs/QA_FINDINGS.md) |
| Day-by-day engineering notes and decisions | [WORKLOG.md](WORKLOG.md) |
| Hosting, security headers and the AI bridge | [deploy/DEPLOY.md](deploy/DEPLOY.md) |
| What was reused from an earlier project | [docs/REUSE_MANIFEST.md](docs/REUSE_MANIFEST.md), [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) |

## Live URL

**https://peopleops.77-42-88-180.sslip.io**, deployed on a VPS (systemd, nginx, Let's Encrypt, isolated PostgreSQL). Source: https://github.com/randev0/nv-people-operations.

The AI router is live (GPT-6.1 Sol through an isolated Codex bridge, see [deploy/DEPLOY.md](deploy/DEPLOY.md)). A suggestion takes about 6–10 seconds and runs in the background after submit; manual routing always works.

## Demo accounts

All data is synthetic (`example.com`). The shared demo password is **`PeopleOps-Demo-2026!`**. It is disposable, set through `DEMO_PASSWORD`, and used only for this assessment. Because the password is public, the live demo data is **reset every night at 03:17 Malaysia time (19:17 UTC)**: anything a visitor changes, including passwords and disabled accounts, is restored for the next reviewer.

| Email | Role | What to try |
| --- | --- | --- |
| `hr.admin@example.com` | HR Admin | Dashboard, all requests, employees, templates, assigning checklists |
| `manager.my@example.com` | Manager (Malaysia, Engineering) | Team requests: assign, close. Direct reports' onboarding |
| `employee.my@example.com` | Employee (recent hire) | Own requests, AI suggestion, own onboarding checklist |
| `it.owner@example.com` | Employee in IT | Assigned requests and onboarding tasks across several hires (My Work) |
| `employee.cy@example.com` | Employee (Cyprus) | Unrelated user for negative access checks |

A second HR admin, `hr.ops@example.com`, also exists.

## Five-minute walkthrough

1. **employee.my**: Requests → New request. Describe a laptop problem and click **Suggest routing** to see the AI's category, priority and team (if the AI is unavailable you're told so and the draft is kept). Submit. Then open **My Onboarding**: blocked tasks show what they're waiting on, and overdue tasks are flagged.
2. **manager.my**: Dashboard → **Assign requests** tab, or Requests → *My team*. Open the new request: the AI suggestion recommends an IT person and only the IT team is offered (for example Priya Ismail, it.owner). Try a request ID from another team: you get "Not found".
3. **it.owner**: My Work → complete **Create company account**. *Hand over laptop* becomes startable straight away. Assigned requests → start, comment, resolve.
4. **employee.my**: close the resolved request.
5. **hr.admin**: Dashboard → Today (Assign requests tab, most urgent first; try Assign, or Select two requests of one category and assign them together) → Onboarding follow-ups tab (overdue tasks owned by others) → Up next → **Insights** (every figure opens the list behind its number) → Templates → New template (try a prerequisite loop to see the warning) → Onboarding → Assign checklist (deadlines are calculated per task, and each task needs an owner) → Employees (create, edit; disabling someone with open work asks who takes it over).

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
| `AI_PROVIDER` | `anthropic` (default), `openai`, or `codex` (local Codex bridge, `CODEX_BRIDGE_SOCKET`) |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` / `OPENAI_API_KEY`, `OPENAI_MODEL` | Server-only credentials for the selected provider (OpenAI: a platform API key, e.g. model `gpt-6.1-sol`). If the key or model is empty, the AI router returns 503 and everything else still works. |
| `DEMO_PASSWORD` | Password given to every seeded account |
| `ALLOW_ASSESSMENT_SEED` | Must be `true` for the seed to run. Turn it off again after seeding. |
| `SEED_REFERENCE_DATE` | Optional `YYYY-MM-DD` for reproducible data (defaults to today) |
| `LOGIN_RATE_LIMIT`, `LOGIN_RATE_WINDOW_MINUTES`, `LOGIN_SLOWDOWN_MS` | Optional login throttle overrides: per address 10 attempts per 15 min, then 429; per account (any address) after 30 failures each attempt is delayed by 1 s, up to 5 s, rather than locked |
| `AI_RATE_LIMIT_PER_MINUTE`, `AI_GLOBAL_LIMIT_PER_HOUR` | Optional AI budget overrides (defaults 10 per user per minute, 200 per hour across all users) |

The seed is idempotent. It only creates missing fixture rows (deterministic IDs and unique emails), never deletes anything, and doesn't overwrite changes reviewers make. Overdue counts change over time because they are measured against "today" in each hire's timezone.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js development, production build, production server |
| `npm run lint` / `typecheck` | ESLint, `tsc --noEmit` |
| `npm run test:unit` | Pure logic: dates/timezones, DAG validation, permissions, state machine, AI output validation (`node:test`) |
| `npm run test:integration` | Requires `npm run build`. Creates a fresh test database, migrates, seeds, starts the app on :3100 and runs HTTP tests covering authorization, workflows, concurrency, dashboard and AI fallbacks. |
| `npm run test:e2e` | Same harness with Playwright: request lifecycle with AI routing, task unblocking, template editor, role navigation, dashboard tabs and figures against their lists, assignment (single, stale, bulk), error pages and session expiry, keyboard-only use, axe accessibility scan, 390 px layout |
| `npm run db:generate` / `db:migrate` / `db:seed` / `db:verify-seed` | Prisma client, `migrate deploy`, seed, seed assertions |

Latest results (2026-11-10): lint 0 problems, typecheck 0 errors, unit 38/38, integration 34/34, e2e 25/25 (including keyboard-only use and an axe WCAG 2.1 AA scan of 27 pages), seed verification 22/22. See [docs/ACCEPTANCE.md](docs/ACCEPTANCE.md).

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
- A missing record inside the signed-in area shows "Not found" but with HTTP 200, because the loading skeleton has already started streaming (see docs/QA_FINDINGS.md, L7).
- The Content-Security-Policy allows inline `style` attributes (used for chart widths); scripts are nonce-only.
