#!/bin/sh
# Container entrypoint: migrate, then serve.
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

npx prisma migrate deploy

echo "[start] migrations applied; starting Next.js"
exec npm run start
