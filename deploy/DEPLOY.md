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
cp -r .next/standalone/. rel/app/ && cp -r .next/static rel/app/.next/static
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

Seeding was run **once** on 2026-11-09 (`ALLOW_ASSESSMENT_SEED=true npx tsx prisma/seed.ts`, then `verify-seed.ts` → 22/22). The flag is not in the env file, so the app never seeds on boot.

Enable the AI router: the live env file has `AI_PROVIDER=openai` and `OPENAI_MODEL=gpt-6.1-sol`; set `OPENAI_API_KEY=` (an OpenAI platform API key) in `/etc/peopleops/peopleops.env`, then `systemctl restart peopleops`. (Anthropic alternative: `AI_PROVIDER=anthropic` + `ANTHROPIC_API_KEY`/`ANTHROPIC_MODEL`.)

Logs: `journalctl -u peopleops -f`. Rollback: point `/opt/peopleops/current` at the previous release and restart.
