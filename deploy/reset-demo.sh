#!/usr/bin/env bash
# Nightly demo-data reset for the assessment server (installed as /opt/peopleops/bin/reset-demo.sh,
# run by peopleops-reset.timer). The demo passwords are public in the README, so anything a
# visitor changes — passwords reset, accounts disabled, junk requests — is undone every night.
# Backs up first; keeps the last 7 backups. Environment comes from /etc/peopleops/peopleops.env
# via the service unit (DATABASE_URL, DEMO_PASSWORD).
set -euo pipefail
umask 077
TS=$(date -u +%Y%m%d-%H%M%S)
BACKUPS=/root/backups/peopleops
install -d -m 700 "$BACKUPS"

docker exec peopleops-postgres pg_dump -U peopleops -Fc peopleops > "$BACKUPS/before-reset-$TS.dump"
ls -1t "$BACKUPS"/before-reset-*.dump | tail -n +8 | xargs -r rm --

# The app is stopped for the ~10 s rebuild so nobody sees a half-seeded database; restarted even on failure.
systemctl stop peopleops
trap 'systemctl start peopleops' ERR

docker exec peopleops-postgres psql -U peopleops -d peopleops -v ON_ERROR_STOP=1 -q \
  -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'
cd /opt/peopleops/current/tools
npx --no-install prisma migrate deploy
ALLOW_ASSESSMENT_SEED=true npx --no-install tsx prisma/seed.ts
npx --no-install tsx prisma/verify-seed.ts
systemctl start peopleops
trap - ERR

# Stored AI suggestions are not part of the seed (they come from the live model), so regenerate
# them for the open, still-assignable requests, paced under the per-user limit (10/min).
API=http://127.0.0.1:3310/api
ORIGIN="Origin: ${APP_URL:?}"
for _ in $(seq 30); do curl -fsS "$API/health" >/dev/null 2>&1 && break; sleep 1; done
JAR=$(mktemp)
curl -fsS -c "$JAR" -H "$ORIGIN" -H 'Content-Type: application/json' -X POST "$API/auth/login" \
  --data "$(printf '{"email":"hr.admin@example.com","password":"%s"}' "$DEMO_PASSWORD")" >/dev/null
ok=0; failed=0
for id in $(docker exec peopleops-postgres psql -U peopleops -d peopleops -tAc \
    "SELECT id FROM \"ServiceRequest\" WHERE status IN ('SUBMITTED','ASSIGNED') ORDER BY \"createdAt\""); do
  if curl -fsS -b "$JAR" -H "$ORIGIN" -X POST "$API/requests/$id/ai-suggestion" >/dev/null 2>&1; then ok=$((ok+1)); else failed=$((failed+1)); fi
  sleep 7
done
rm -f "$JAR"
echo "demo reset complete ($TS); AI suggestions regenerated: $ok ok, $failed failed"
