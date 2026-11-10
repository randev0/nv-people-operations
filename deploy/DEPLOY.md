# Deployment runbook (VPS)

Live: **https://peopleops.77-42-88-180.sslip.io** (sslip.io resolves the name to 77.42.88.180; Let's Encrypt certificate via certbot).

The VPS is shared with other sites/apps, so everything is isolated and nothing existing was changed:

| Piece | Where |
| --- | --- |
| Linux user | `peopleops` (system user, no shell) |
| Database | Docker container `peopleops-postgres` (postgres:16-alpine, volume `peopleops-pgdata`, `127.0.0.1:5442`, 256 MB limit) — separate from the box's other Postgres containers |
| App | `/opt/peopleops/releases/<commit>/app` (Next.js standalone build), `/opt/peopleops/current` → active release |
| Migration/seed tools | `/opt/peopleops/releases/<commit>/tools` (prisma, tsx, bcryptjs + `prisma/` + date helpers) |
| Secrets | `/etc/peopleops/peopleops.env` (root:peopleops 0640): `DATABASE_URL`, `SESSION_SECRET`, `APP_URL`, `DEMO_PASSWORD`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` |
| Service | `peopleops.service` (systemd, `127.0.0.1:3310`, MemoryMax 512M) — see `deploy/peopleops.service` |
| Web | nginx vhost `/etc/nginx/sites-available/peopleops` — see `deploy/nginx-peopleops.conf` |

The app is built off-box (the VPS has ~1 GB free RAM and swap nearly full), then shipped:

```bash
# build machine
BUILD_STANDALONE=1 npm run build
mkdir -p rel/app rel/tools/src/server/onboarding
cp -r .next/standalone/. rel/app/ && cp -r .next/static rel/app/.next/static && cp -r public rel/app/public
rm -f rel/app/.env                 # Next copies the build machine's .env into standalone; never ship it
cp -r prisma rel/tools/ && cp src/server/onboarding/{dates,dependencies}.ts rel/tools/src/server/onboarding/
# rel/tools/package.json pins prisma@6.19.3 @prisma/client@6.19.3 tsx@4.23.15 bcryptjs@3.0.3
tar czf release.tgz rel && scp release.tgz root@77.42.88.180:/root/

# VPS (as root)
REL=<commit>; mkdir -p /opt/peopleops/releases/$REL && tar xzf release.tgz ...  # → app/ + tools/
cd /opt/peopleops/releases/$REL/tools && npm install --no-audit --no-fund
set -a; . /etc/peopleops/peopleops.env; set +a
npx prisma migrate deploy                        # never `migrate reset`
ln -sfn /opt/peopleops/releases/$REL /opt/peopleops/current && chown -R peopleops: /opt/peopleops
systemctl restart peopleops && curl -s http://127.0.0.1:3310/api/health
```

Seeding was first run on 2026-11-09 (`ALLOW_ASSESSMENT_SEED=true npx tsx prisma/seed.ts`, then `verify-seed.ts` → 22/22). The flag is not in the env file, so the app never seeds on boot.

### Nightly demo reset

The demo passwords are public (README), so the data is rebuilt every night by `peopleops-reset.timer` (19:17 UTC, 03:17 in Kuala Lumpur) running `/opt/peopleops/bin/reset-demo.sh` (source: `deploy/reset-demo.sh`, units `deploy/peopleops-reset.{service,timer}`). The script:

1. takes a `pg_dump` to `/root/backups/peopleops/before-reset-<UTC time>.dump` (0700 folder, last 7 kept);
2. stops the app (always restarted on exit);
3. drops and recreates the `public` schema of the `peopleops` database only, runs `prisma migrate deploy`, the seed (`ALLOW_ASSESSMENT_SEED=true` set for that one command) and `verify-seed.ts`.

Run it by hand with `systemctl start peopleops-reset`; logs in `journalctl -u peopleops-reset`. Dates in the seed are relative to the day it runs, so overdue and due-soon items stay realistic. Restore a backup with `docker exec -i peopleops-postgres pg_restore -U peopleops -d peopleops --clean < <dump>`.

## AI provider on the VPS: Codex bridge

The live AI router calls OpenAI GPT-6.1 Sol (`gpt-6.1-sol`) through the Codex CLI, run by a separate service with its **own credentials**, isolated from the app:

| Piece | Where |
| --- | --- |
| Linux user | `peopleops-ai` (no shell; cannot read `/etc/peopleops/peopleops.env` or `/opt/peopleops`) |
| Codex login | `CODEX_HOME=/var/lib/peopleops-ai/codex` (0700), created with `codex login --device-auth` |
| Bridge | `/opt/peopleops-ai/bridge.mjs` as `peopleops-ai.service` (see `deploy/codex-bridge/`), unix socket `/run/peopleops-ai/bridge.sock` (0660, group `peopleops-ai`; the app user `peopleops` is a member) |
| App config | `AI_PROVIDER=codex`, `CODEX_BRIDGE_SOCKET=/run/peopleops-ai/bridge.sock` |

Each suggestion runs one ephemeral `codex exec` with model `gpt-6.1-sol`, read-only sandbox, `approval_policy=never`, web search off, shell/exec/browser/apps/plugins features disabled, an empty working directory, `--ignore-user-config`, and `--output-schema` (the same strict JSON schema); the app then validates the result against live database IDs as for any provider. Re-login: `sudo -u peopleops-ai env HOME=/var/lib/peopleops-ai CODEX_HOME=/var/lib/peopleops-ai/codex codex login --device-auth`. Status: `... codex login status`. Logs: `journalctl -u peopleops-ai`.

Switching to a direct API key needs only `AI_PROVIDER=openai` + `OPENAI_API_KEY`.

Alternative: the env file also supports `AI_PROVIDER=openai` and `OPENAI_MODEL=gpt-6.1-sol`; set `OPENAI_API_KEY=` (an OpenAI platform API key) in `/etc/peopleops/peopleops.env`, then `systemctl restart peopleops`. (Anthropic alternative: `AI_PROVIDER=anthropic` + `ANTHROPIC_API_KEY`/`ANTHROPIC_MODEL`.)

When `package-lock.json` is unchanged since the running release, a slim bundle (standalone output without `node_modules`, about 1.4 MB instead of 56 MB) can be shipped and the previous release's `app/node_modules` copied in on the VPS (`cp -a <prev>/app/node_modules <new>/app/`). Used for 236efde after the full bundle timed out in transfer.

Security headers: the app sets a per-request nonce Content-Security-Policy and, when `APP_URL` is https, `Strict-Transport-Security` (src/proxy.ts); nginx has `server_tokens off` in both peopleops server blocks (2026-11-10; backups of the vhost in `/root/backups/nginx-peopleops-*.conf`).

Service sandboxing (2026-11-10): besides the unprivileged user, `peopleops.service` runs with `ProtectSystem=strict` (writable only `/opt/peopleops/releases` and the AI socket directory), `ProtectHome`, `PrivateDevices`, kernel/cgroup protections, no capabilities and only inet/unix sockets; see `deploy/peopleops.service`.

Release retention: only the current release and the two before it are kept in `/opt/peopleops/releases` (older ones removed after each deploy: `ls -1t | tail -n +4`), since the disk is shared.

Logs: `journalctl -u peopleops -f` (browser-side errors appear as `"event":"client.error"` lines). Rollback: point `/opt/peopleops/current` at the previous release and restart.
