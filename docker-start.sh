#!/bin/sh
# Container entrypoint: migrate, seed, then serve.
#
# Kept as a file rather than an inline CMD so the pre-flight check below can
# exist. A failed `prisma migrate deploy` exits the container, the platform
# restarts it, and the loop buries the one line that says why — so this
# prints what it is about to do, in terms the operator can act on, before
# handing over to Prisma.
set -e

if [ -z "$DATABASE_URL" ]; then
  echo "[start] DATABASE_URL is not set on this service."
  echo "[start] Set it to the PostgreSQL service's INTERNAL connection string"
  echo "[start] and redeploy. Nothing else here can work without it."
  exit 1
fi

# Print the target with the password removed: "is the variable set, and does
# it point where I think it does" is the question a boot failure raises, and
# the answer must not be a credential in a build log.
echo "[start] database target: $(echo "$DATABASE_URL" | sed -E 's#(://[^:/]+):[^@]*@#\1:***@#')"
echo "[start] applying migrations..."

# Through npx, not bare: CMD runs this with a plain PATH, so
# node_modules/.bin is not on it. (`npm run` below sets it up itself.)
npx prisma migrate deploy

# Seed the ModelConfig rows. Migrations create the EMPTY table; without this
# the app boots fine and the model list is blank, which reads as a bug.
#
# Safe on every boot: the seed fills the model list only when it is empty, so
# a model added or deleted in 設定 survives a redeploy. Pricing is applied
# every time, since prices change and rows are only ever added.
#
# Deliberately NOT fatal, unlike the migration above. A migration failure
# means the schema does not match the code and serving would produce wrong
# answers; a seed failure just means the model list is empty, and taking the
# whole app down for that is the worse outcome.
echo "[start] seeding model configuration..."
if npm run --silent db:seed; then
  echo "[start] seed complete"
else
  echo "[start] WARNING: seed failed — the app will start, but 設定 may list"
  echo "[start] no models. Re-run 'npm run db:seed' against this database."
fi

echo "[start] starting Next.js"
exec npm run start
