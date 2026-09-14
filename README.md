# AI Council

Ask one question, get independent analysis from several AI models, an anonymous cross-critique round, and a chairman decision — with every billable API call recorded as an auditable ledger row.

```
User Question
      │
      ▼
Round 1      multiple models analyze in parallel, independently
      │
      ▼
Critique     anonymous cross-review (Response A / B / C …)
      │
      ▼
Chairman     integrates everything and decides
      │
      ▼
Final Answer
```

Supported providers today: **OpenAI**, **Anthropic**, **Google Gemini**, **xAI**. The provider layer is an adapter pattern — adding Muse, Spark, DeepSeek, Kimi, GLM or Qwen means writing one adapter and registering it. The Council Engine does not change.

---

## Architecture

```
GitHub
   │
   ▼
Zeabur
   │
   ├── Next.js App
   │      ├── UI              (App Router, Tailwind, shadcn/ui)
   │      ├── API             (route handlers, SSE)
   │      ├── AI Provider Layer
   │      ├── Council Engine
   │      └── Usage Analytics
   │
   └── PostgreSQL
```

Monolith by design. No Redis, no BullMQ, no worker, no separate backend repo in V1.

### Core principles

1. **PostgreSQL is the single source of truth.** No reliance on OpenAI/Claude/Gemini conversation IDs. Conversations, council runs, responses, tokens and costs all live in our own database.
2. **`ModelRun` = billing ledger.** Every billable AI API call creates exactly one auditable `ModelRun` row. Retries stay inside the same row (`attemptCount` records them). Council totals on `CouncilRun` are a display snapshot; the ledger is authoritative.
3. **Pricing is never hardcoded.** `ModelPricing` rows are looked up at call time and **snapshotted onto the `ModelRun`**, so a 2027 price change cannot retroactively rewrite 2026 invoices.
4. **Money is `Decimal(18,10)`.** Never a JavaScript float. A $0.000003 request does not round to zero.
5. **Provider-reported usage only.** If a provider does not report a token count, the field is `null`. We never estimate with a tokenizer and present it as billing data. The raw provider usage payload is kept in `rawUsage` JSONB for future re-analysis.
6. **Partial failure is normal.** One provider going down must never take the council with it.

### Layer boundaries

| Layer | Responsible for | Must NOT do |
|---|---|---|
| Provider adapter (`src/server/ai/providers/`) | request/response translation, usage normalization, provider errors, request IDs, finish reason | council logic, cost math, database access |
| `ModelRouter` (`src/server/ai/router.ts`) | ledger row lifecycle, timeout, retry, pricing snapshot, cost persistence | provider-specific behavior |
| Council Engine (`src/server/council/`) | stage orchestration, anonymization, partial-failure rules | calling provider SDKs directly |
| Cost engine (`src/server/usage/calculate-cost.ts`) | all money arithmetic | knowing which provider it is |

API keys, `DATABASE_URL`, provider SDK calls and cost backend all live under `src/server/*` and never reach the browser bundle.

---

## Local setup

Requirements: Node 20+, PostgreSQL 14+.

```bash
npm install
cp .env.example .env     # fill in DATABASE_URL and whichever API keys you have
```

### PostgreSQL

```bash
createuser council --createdb --pwprompt
createdb ai_council -O council
```

Then in `.env`:

```env
DATABASE_URL=postgresql://council:council@localhost:5432/ai_council
```

### Prisma migration

```bash
npx prisma generate
npx prisma migrate deploy      # apply existing migrations
# or, when changing the schema during development:
npx prisma migrate dev --name <change-name>
```

### Seed

```bash
npm run db:seed
```

Seeds `ModelConfig` rows for the four providers. Pricing is **not** seeded by default — see [Updating model pricing](#updating-model-pricing).

### Development

```bash
npm run dev            # http://localhost:3000
```

### Testing

```bash
npm test               # vitest run
npm run test:watch
```

Provider tests use mocked `fetch` responses. **Automated tests never call real paid AI APIs.** Router, council and analytics tests use the local PostgreSQL database and clean up after themselves.

### Production build

```bash
npm run build          # prisma generate && next build
npm start
```

---

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | PostgreSQL connection string |
| `OPENAI_API_KEY` | optional | enables the OpenAI provider |
| `ANTHROPIC_API_KEY` | optional | enables the Anthropic provider |
| `GOOGLE_AI_API_KEY` | optional | enables the Gemini provider |
| `XAI_API_KEY` | optional | enables the xAI provider |
| `APP_SECRET` | optional | reserved for authentication |
| `PROVIDER_TIMEOUT_MS` | optional | per-request provider timeout, default 120000 |
| `COUNCIL_STALE_AFTER_MS` | optional | a non-terminal run older than this is marked FAILED, default 900000 |

A provider with no key is simply absent from the registry; its models show "API key missing" in Settings and cannot be selected for a council. Missing keys never block development of anything else.

Never commit `.env`. API keys are never returned to the frontend and are never stored in PostgreSQL.

---

## Database

| Table | Role |
|---|---|
| `User` | single-user-compatible abstraction; sessions may be anonymous |
| `Session` | one conversation (SOLO / COMPARE / COUNCIL / BATTLE) |
| `Message` | the real conversation history: user questions, solo answers, chairman final answers |
| `CouncilRun` | one council execution, its state machine position and total snapshot |
| `ModelRun` | **the billing ledger** — one row per billable API call |
| `ModelConfig` | which models the UI offers, their council role and defaults |
| `ModelPricing` | price history per provider+model, with effective date windows |

Council internal outputs (Round 1 answers, critiques) live in `ModelRun.response` — they are not promoted to conversation `Message` rows. Only the user question, a solo model answer, and the chairman final answer become messages.

Every `ModelRun` can answer: who called, which provider, which model, which session, which council, which stage, when it started, how long it took, whether it succeeded, how many input/output/cached/reasoning tokens it used, what the unit price was at that moment, what it cost in USD, and exactly what the provider's raw usage payload said.

---

## API

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/sessions` | create a session |
| GET | `/api/sessions` | list sessions with token/cost totals |
| GET | `/api/sessions/:id` | session detail with messages, council runs and model runs |
| POST | `/api/chat` | solo chat |
| POST | `/api/compare` | same question to several models in parallel |
| POST | `/api/council` | start a council run → `{ runId, status: "PENDING" }` (202) |
| GET | `/api/council/:runId` | council run state, per-model cost breakdown, final answer |
| GET | `/api/council/:runId/stream` | Server-Sent Events progress stream |
| GET | `/api/models` | model configs with pricing/API-key status |
| PATCH | `/api/models` | enable/disable a model, change its role or defaults |
| GET | `/api/pricing` | full pricing history |
| POST | `/api/pricing` | add a new price (closes the previous active row) |
| GET | `/api/usage/summary` | totals for a date range |
| GET | `/api/usage/models` | per-provider/model aggregation |
| GET | `/api/usage/runs` | ledger rows with filters and pagination |
| GET | `/api/health` | app + database health; never calls a paid AI API |

### Council request

```json
{
  "sessionId": "uuid",
  "message": "名留是否應該投資越南 Salon？",
  "models": [
    { "provider": "OPENAI", "modelId": "gpt-5.1" },
    { "provider": "ANTHROPIC", "modelId": "claude-sonnet-4-5" }
  ],
  "chairman": { "provider": "OPENAI", "modelId": "gpt-5.1" }
}
```

Every `provider`/`modelId` from the frontend is validated against `ModelConfig` and must be `enabled = true`.

### SSE events

`council.started`, `stage.started`, `model.started`, `model.delta`, `model.completed`, `model.failed`, `stage.completed`, `chairman.started`, `chairman.delta`, `chairman.completed`, `council.completed`, `council.failed`.

Each payload carries at least `runId`, `timestamp`, and where applicable `modelRunId`, `provider`, `modelId`, `stage`.

### V1 reliability constraint

Council execution is **in-process**. This is not a durable queue. If the container restarts mid-run, that run is interrupted. Runs left in `PENDING` / `ROUND_1` / `CRITIQUE` / `CHAIRMAN` beyond `COUNCIL_STALE_AFTER_MS` are marked `FAILED` on the next read (`markStaleCouncilRuns`). Usage and cost already written to the ledger are never lost. Redis / BullMQ / workers are Phase 2.

### Failure rules

- Round 1 uses `Promise.allSettled`, never `Promise.all`.
- 0 Round 1 successes → council `FAILED`, no chairman call.
- ≥ 1 success → continue.
- Fewer than 2 usable responses → critique is skipped, chairman still runs; the chairman prompt says so.
- Any failure along the way but a successful chairman → `PARTIAL`.
- Chairman failure → `FAILED`, with all earlier usage preserved.
- Retries: only 429, provider 5xx and temporary network errors, max 2 retries, exponential backoff. Never 401/403/invalid model/validation errors. Never after a timeout.

---

## Zeabur deployment

Two services:

| Service | What |
|---|---|
| 1 | Next.js app (this repo) |
| 2 | PostgreSQL |

The repository supports the standard flow:

```bash
npm install
npx prisma generate
npx prisma migrate deploy
npm run build
npm start
```

Steps:

1. Create a PostgreSQL service in Zeabur and copy its connection string.
2. Create a service from this GitHub repository.
3. Set the environment variables listed above; `DATABASE_URL` points at the PostgreSQL service.
4. Add `npx prisma migrate deploy` as the pre-start / release command so migrations run before the app boots.
5. Push to `main` — Zeabur builds and deploys automatically.
6. After the first deploy, run `npm run db:seed` once against the production database to create `ModelConfig` rows.
7. Verify `GET /api/health` returns `{"status":"ok","database":"ok"}`.

This project uses Prisma's driver-adapter + query-compiler mode (`engineType = "client"` with `@prisma/adapter-pg`), so no native query-engine binary needs to be downloaded at build time.

---

## Adding a provider

To add Muse, Spark, DeepSeek or anything else:

1. **Create the adapter** in `src/server/ai/providers/<name>.ts`.
2. **Implement `AIProvider`** — a `provider` name plus `generate(request): Promise<AIResponse>`.
3. **Normalize provider usage** into `NormalizedUsage`, honoring the contracts: `cachedInputTokens ⊆ inputTokens`, `reasoningTokens ⊆ outputTokens`, unknown values are `null`, and the untouched payload goes into `rawUsage`. Add a helper to `src/server/ai/normalize-usage.ts` if the shape is new.
4. **Register it** in `src/server/ai/registry.ts` (add the enum value to `prisma/schema.prisma` and migrate if the provider is new).
5. **Add a `ModelConfig` row** (seed or Settings).
6. **Add a `ModelPricing` row** when you know the prices.
7. **Add provider normalization tests** with mocked responses.
8. **Add integration mock tests** exercising the adapter through the router.

The Council Engine needs no changes. Do not invent an API specification for a provider whose API you have not confirmed.

## Adding a model

Add a row to `prisma/seed.ts` (or insert directly), then `npm run db:seed`. The UI reads `ModelConfig` — model names are never hardcoded in components.

## Updating model pricing

Prices live in the database, not in code. Changing a price needs no redeploy.

Seeding from a file:

```bash
cp prisma/pricing.example.json prisma/pricing.json
# fill in the real per-million USD prices from each provider's pricing page
npm run db:seed
```

Or via the API:

```bash
curl -X POST http://localhost:3000/api/pricing \
  -H 'Content-Type: application/json' \
  -d '{"provider":"OPENAI","modelId":"gpt-5.1","inputPerMillion":"1.25","outputPerMillion":"10","source":"openai pricing page"}'
```

Adding a price **closes** the previously active row (sets its `effectiveTo`) and inserts a new one. Existing rows are never edited in place, and `ModelRun` price snapshots are never touched — so historical cost analytics stay correct forever.

If a model has no price configured, calls still succeed; the run records `pricingStatus = MISSING` and `totalCostUsd = null`, and the UI shows "Pricing not configured".
