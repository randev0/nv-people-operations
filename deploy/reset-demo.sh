#!/usr/bin/env bash
# Nightly demo-data reset for the assessment server (installed as /opt/peopleops/bin/reset-demo.sh,
# run by peopleops-reset.timer). The demo passwords are public in the README, so anything a
# visitor changes — passwords reset, accounts disabled, junk requests — is undone every night.
# Backs up first; keeps the last 7 backups. Environment comes from /etc/peopleops/peopleops.env
# via the service unit (DATABASE_URL, DEMO_PASSWORD).
set -euo pipefail
TS=$(date -u +%Y%m%d-%H%M%S)
BACKUPS=/root/backups/peopleops
install -d -m 700 "$BACKUPS"

docker exec peopleops-postgres pg_dump -U peopleops -Fc peopleops > "$BACKUPS/before-reset-$TS.dump"
ls -1t "$BACKUPS"/before-reset-*.dump | tail -n +8 | xargs -r rm --

# The app is stopped for the ~30 s rebuild so nobody sees a half-seeded database; always restarted.
systemctl stop peopleops
trap 'systemctl start peopleops' EXIT

docker exec peopleops-postgres psql -U peopleops -d peopleops -v ON_ERROR_STOP=1 -q \
  -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'
cd /opt/peopleops/current/tools
npx --no-install prisma migrate deploy
ALLOW_ASSESSMENT_SEED=true npx --no-install tsx prisma/seed.ts
npx --no-install tsx prisma/verify-seed.ts
echo "demo reset complete ($TS)"
