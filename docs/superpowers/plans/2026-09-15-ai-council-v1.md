# AI Council V1 — Implementation Checklist

Date: 2026-09-15
Status: V1 complete. Remaining items are those requiring real API credentials.

---

## Phase 1 — Project foundation ✅

- [x] Next.js 14 App Router, TypeScript strict mode, `src/` directory, `@/*` alias
- [x] Tailwind CSS with CSS-variable theming
- [x] shadcn/ui component set (button, card, badge, input, textarea, label, switch, select, tabs, table, separator, collapsible) built on Radix primitives
- [x] Prisma 6 with `@prisma/adapter-pg` driver adapter + query compiler (`engineType = "client"`)
- [x] PostgreSQL local database
- [x] Vitest + Testing Library + jsdom
- [x] Environment validation with zod (`src/lib/env.ts`), server-only
- [x] `.env.example`, `.env` gitignored
- [x] `npm test` and `npm run build` both pass
- [x] Commit: `chore: initialize ai council app`

## Phase 2 — Database ✅

- [x] `User`, `Session`, `Message`, `CouncilRun`, `ModelRun`, `ModelConfig`, `ModelPricing`
- [x] All enums (SessionMode, SessionStatus, MessageRole, MessageSource, ProviderName, CouncilRunStatus, ModelRunStage, CouncilRole, ModelRunStatus, PricingStatus)
- [x] Money columns as `Decimal(18,10)` — never Float
- [x] Pricing snapshot columns on `ModelRun`
- [x] `rawUsage` / `rawResponseMetadata` JSONB
- [x] All indexes from the specification
- [x] Migration `20260914000000_init` created and applied
- [x] Commit: `feat: add database schema`

## Phase 3 — Cost engine ✅ (TDD — tests written first)

- [x] `PricingSnapshot` / `BillableUsage` / `CostBreakdown` types
- [x] `getActivePricing` with `effectiveFrom <= now AND (effectiveTo IS NULL OR effectiveTo > now)`
- [x] `calculateCost` — the only place money arithmetic happens
- [x] Cached-input tokens billed without double counting
- [x] Reasoning tokens billed without double counting
- [x] Missing price → `pricingStatus = MISSING`, costs null, request still succeeds
- [x] Decimal precision preserved for sub-cent costs
- [x] 10 unit tests covering input, output, zero tokens, missing price, cached, reasoning, precision, over-reported cached tokens
- [x] Commit: `feat: add model pricing and cost engine`

## Phase 4 — Provider interface ✅

- [x] `AIProvider`, `AIRequest`, `AIResponse`, `NormalizedUsage`, `AIStreamEvent`
- [x] `ProviderError` with classification and retryability
- [x] `ProviderRegistry` built from environment keys
- [x] `ModelRouter` (`executeModelRun`) — the single path for every billable call
- [x] Retry policy: 429 / 5xx / network only, max 2 retries, exponential backoff, never on abort
- [x] Timeout via `AbortController`, duration from server config

## Phase 5 — Provider implementations ✅

- [x] `OpenAIProvider` (`max_completion_tokens`)
- [x] `XAIProvider` (OpenAI-compatible, `max_tokens`)
- [x] `AnthropicProvider` (system separate from messages, `max_tokens` required)
- [x] `GeminiProvider` (`systemInstruction`, `generationConfig`, `:generateContent`)
- [x] Usage normalization per provider with subset contracts
- [x] 22 tests with mocked fetch — no real API calls
- [x] Commit: `feat: add ai provider abstraction and providers`

## Phase 6 — Solo chat ✅

- [x] `POST /api/chat` routed through `ModelRouter`, never a raw SDK call
- [x] Conversation history read from PostgreSQL (no provider conversation IDs)
- [x] Message saved, ModelRun saved, tokens saved, cost saved, latency saved
- [x] Verified by router tests

## Phase 7 — Compare mode ✅

- [x] `POST /api/compare` with `Promise.allSettled` parallel execution
- [x] One ModelRun per model, full usage/cost/latency/status each
- [x] Per-model failure does not fail the request

## Phase 8 — Council engine ✅

- [x] `round-one.ts` — parallel, independent, role-assigned, no cross-visibility
- [x] `critique.ts` — anonymization (`Response A/B/C…`), six required critique questions
- [x] `chairman.ts` — seven-section structured output, "best decision, not average"
- [x] `orchestrator.ts` — state machine, totals aggregation, stale-run recovery
- [x] Failure rules: 0 successes → FAILED; <2 responses → skip critique; any failure + chairman OK → PARTIAL; chairman failure → FAILED with usage preserved
- [x] 9 tests: all success (asserts exactly 9 ModelRuns), anonymity verification, one failure, all failures, critique skip, chairman failure, critique partial failure, label assignment, stale recovery
- [x] Commit: `feat: add council orchestration`

## Phase 9 — SSE ✅

- [x] `GET /api/council/:runId/stream` with all 12 event types
- [x] In-process event hub with history replay for mid-run connections
- [x] Heartbeat, terminal-state short-circuit after restart
- [x] Council UI consumes events and refreshes run state

## Phase 10 — History ✅

- [x] `/history` list with per-session tokens, cost, model call count
- [x] `/history/[id]` detail with conversation, council runs, per-council cost breakdown, individual model runs

## Phase 11 — Usage dashboard ✅ (V1 scope, not deferred)

- [x] Overview: total spend, tokens, calls, successful, failed, average latency
- [x] Per-model table: calls, input/output/cached/reasoning/total tokens, cost, average cost per call, average latency, success rate
- [x] Ranges: Today / 7 Days / 30 Days / Custom
- [x] `GET /api/usage/summary`, `/api/usage/models`, `/api/usage/runs` (filters + pagination)
- [x] All figures aggregated from the ModelRun ledger, not a separate counter
- [x] 5 analytics tests against fixture ledger rows

## Phase 12 — Settings ✅

- [x] Model list with enable/disable toggle, council role selector, temperature, max output tokens
- [x] Pricing status and API-key status per model
- [x] Pricing tab: full price history with active/historical marking
- [x] `PATCH /api/models`, `GET/POST /api/pricing` (append-only — never rewrites history)

## Phase 13 — Production readiness ✅

- [x] `prisma/seed.ts` — idempotent ModelConfig seed, optional pricing from `prisma/pricing.json`
- [x] `GET /api/health` — app + database only, no paid API calls
- [x] README with all required sections
- [x] Design spec and this plan under `docs/superpowers/`
- [x] `npm test` — 53 passing
- [x] `npm run lint` — clean
- [x] `npm run build` — succeeds
- [x] Production server smoke test: all pages 200, health ok

---

## Engineering rules — compliance

| Rule | Status |
|---|---|
| No AI SDK calls inside React components | ✅ all provider access under `src/server/*` |
| No API keys reaching the frontend | ✅ env module is server-only |
| No hardcoded model pricing | ✅ `ModelPricing` table; a `grep` for price literals finds none |
| No hardcoded model names in UI | ✅ UI reads `ModelConfig` |
| Council logic not in the API route | ✅ `src/server/council/*` |
| One provider error never crashes the council | ✅ `Promise.allSettled` + PARTIAL tests |
| Individual model runs recorded, not just session totals | ✅ ModelRun per call, asserted at 9 per council |
| No guessed token usage | ✅ provider-reported only, else null |
| No Float for money | ✅ `Decimal(18,10)` + decimal.js |
| Raw provider usage retained | ✅ `rawUsage` JSONB |

---

## Not done / requires real credentials

These cannot be verified without real API keys and are explicitly **not** claimed as tested:

1. **Live provider integration** for OpenAI, Anthropic, Gemini and xAI. Adapters are written against each vendor's documented HTTP contract and covered by mocked-response tests, but no real request has been made from this environment. First real call may reveal field-name drift (especially in usage payloads) — check `rawUsage` on the first live ModelRun of each provider and adjust normalization if needed.
2. **Actual model IDs.** `prisma/seed.ts` uses plausible current IDs (`gpt-5.1`, `claude-sonnet-4-5`, `gemini-2.5-pro`, `grok-4`). Confirm against each provider's model list and your account's access before production use.
3. **Actual prices.** No price is hardcoded anywhere. `prisma/pricing.example.json` is a template with zeros and source URLs; fill in real per-million prices and copy to `prisma/pricing.json`. Until then runs record `pricingStatus = MISSING`.
4. **Streaming deltas.** `model.delta` / `chairman.delta` event types are defined and the `stream?()` method is optional on `AIProvider`, but no adapter implements token streaming yet. Progress events (started/completed/failed) do stream. Implementing deltas is additive and requires no council changes.
5. **Zeabur deployment itself.** Build, migration and start commands are verified locally; the actual Zeabur service configuration has not been exercised.
6. **Authentication.** `User` exists as a single-user-compatible abstraction; sessions are anonymous. No auth provider is wired, per the instruction not to let authentication delay core development.

## Phase 2 (deliberately deferred)

Redis, BullMQ, worker processes, durable council queue. V1 uses in-process execution with stale-run recovery and is explicit about that limitation.
