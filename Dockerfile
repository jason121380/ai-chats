# Container build for Zeabur.
#
# A Dockerfile rather than Zeabur's Next.js auto-detection, because this app
# needs a PERSISTENT Node server, not serverless functions:
#
#   * POST /api/council returns immediately and keeps orchestrating the run
#     in-process (`void runCouncil(...)`). A serverless function is frozen
#     once it responds, so the run would sit at PENDING forever.
#   * GET /api/council/:runId/stream is a long-lived SSE connection.
#
# Both failure modes are silent — the deploy looks healthy and only council
# runs break — which is why the delivery method is pinned here in the repo
# instead of left to a dashboard setting someone can flip.

# ── build ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS build
WORKDIR /app

# package.json + prisma/ before the rest: `npm ci` runs `prisma generate`
# in postinstall, so the schema has to already be on disk.
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

COPY . .

# `next build` imports every route module to collect page data, and
# src/server/db/prisma.ts validates DATABASE_URL the moment it is imported —
# so the build fails without one ("Failed to collect page data for
# /api/chat"). Nothing actually connects during a build (the pg pool is
# lazy), so a syntactically valid placeholder is enough. It lives only in
# this stage and never reaches the runtime image, where Zeabur supplies the
# real value.
ENV DATABASE_URL="postgresql://build:build@127.0.0.1:5432/build"
RUN npm run build

# The prisma CLI is a runtime dependency here — it runs `migrate deploy` at
# container start — so dropping dev deps keeps it. The regenerate after the
# prune is defensive: npm 10 leaves node_modules/.prisma alone (verified),
# but it is not a package in the dependency tree, so nothing guarantees a
# future npm keeps it, and its absence only surfaces as a crash on the
# first query.
RUN npm prune --omit=dev && npx prisma generate

# ── run ───────────────────────────────────────────────────────────────
FROM node:20-alpine AS run
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/next.config.mjs ./next.config.mjs
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/docker-start.sh ./docker-start.sh

EXPOSE 3000

# Migrations run before the server accepts traffic. If one fails the
# container exits instead of serving against a schema it does not match —
# a loud failure beats every query 500ing for an unclear reason. Invoked
# through `sh` so a missing exec bit on the file cannot break the boot.
CMD ["sh", "./docker-start.sh"]
