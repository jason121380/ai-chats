# AI Council — V1 Design Specification

Status: implemented
Date: 2026-09-15

## 1. Product goal

A multi-model advisory council. The user asks one question; several AI models analyze it independently, critique each other anonymously, and a chairman model integrates everything into a decision.

Modes: Solo Chat, Compare, Council, Chairman Summary, plus Conversation History, Model Management and Usage/Cost Analytics.

Council flow is fixed. V1 does not implement an unbounded agent loop.

```
User Question → Round 1 (parallel, independent)
             → Critique (anonymous cross-review)
             → Chairman (integrate and decide)
             → Final Answer
```

## 2. Architecture decisions

Monolith: Next.js 14 (App Router) + TypeScript strict + Tailwind + shadcn/ui, Prisma 6 + PostgreSQL, Vitest. Deployment GitHub → Zeabur, two services (app + PostgreSQL).

Explicitly excluded from V1: Redis, BullMQ, Kafka, microservices, a separate backend repository, WebSockets (SSE instead).

Prisma runs in driver-adapter + query-compiler mode (`engineType = "client"` with `@prisma/adapter-pg`), avoiding a native query-engine binary download at build time — relevant for constrained build environments.

## 3. Core data principle

> Every billable AI API call must create exactly one auditable `ModelRun` record.

`ModelRun` is the billing ledger. `CouncilRun` totals are a convenience snapshot computed from it. Dashboards aggregate `SUM(ModelRun…)`, never a separately maintained counter.

A full Council with four members therefore produces at least nine rows: 4 Round 1 + 4 Critique + 1 Chairman.

Each row answers: who, which provider, which model, which session, which council, which stage, start time, duration, success or failure, input/output/cached/reasoning tokens, the unit prices in force at that instant, the USD cost, and the provider's raw usage payload.

## 4. Pricing model

`ModelPricing` holds price history per `provider + modelId` with `effectiveFrom` / `effectiveTo` windows. Lookup at call time:

```
effectiveFrom <= now AND (effectiveTo IS NULL OR effectiveTo > now)
```

The resolved prices are **snapshotted onto the `ModelRun`** (`inputPricePerMillionUsd`, `outputPricePerMillionUsd`, `cachedInputPricePerMillionUsd`, `reasoningPricePerMillionUsd`, `pricingEffectiveAt`, `pricingSource`). Future price changes therefore cannot alter historical cost records.

No price is hardcoded anywhere in the codebase. Changing a price is a database write, not a deploy.

If a model has no configured price the request still succeeds: `pricingStatus = MISSING`, cost fields `null`.

All money is `Decimal(18,10)` in PostgreSQL and `decimal.js` in application code. Floats are never used for money.

## 5. Usage normalization

Providers report token usage in incompatible shapes. Adapters normalize into:

```ts
interface NormalizedUsage {
  inputTokens: number | null
  outputTokens: number | null
  totalTokens: number | null
  cachedInputTokens: number | null
  reasoningTokens: number | null
  rawUsage: unknown
}
```

Contracts enforced by the adapters and relied upon by the cost engine:

- `cachedInputTokens` is a **subset** of `inputTokens`.
- `reasoningTokens` is a **subset** of `outputTokens`.
- Anything the provider did not report is `null` — never a tokenizer estimate presented as billing data.
- `rawUsage` always keeps the untouched payload, so future token categories (audio, image, tool, cache creation) can be re-analyzed retroactively.

Provider-specific folding:

| Provider | Folding applied |
|---|---|
| OpenAI / xAI | `prompt_tokens_details.cached_tokens` → cached; `completion_tokens_details.reasoning_tokens` → reasoning |
| Anthropic | `cache_read_input_tokens` + `cache_creation_input_tokens` folded into `inputTokens`; cache reads exposed as cached |
| Gemini | `thoughtsTokenCount` folded into `outputTokens` and exposed as reasoning |

Cost avoids double counting: input cost is computed on `inputTokens - cachedInputTokens` when a cached rate exists, otherwise all input bills at the input rate. Same pattern for reasoning against output.

## 6. Provider abstraction

```ts
interface AIProvider {
  provider: ProviderName
  generate(request: AIRequest): Promise<AIResponse>
  stream?(request: AIRequest): AsyncIterable<AIStreamEvent>
}
```

Adapters own: request translation, response translation, usage normalization, provider error classification, request IDs, finish reason. Adapters do not own: council logic, cost analytics, database or UI concerns.

`ProviderRegistry` maps `ProviderName → AIProvider`, built from environment API keys. A provider without a key is absent, and its models are unselectable. Adding a provider means writing an adapter and registering it; the Council Engine is untouched.

`ModelRouter` is the single path every billable call takes (Solo, Compare, Round 1, Critique, Chairman). It:

1. validates the model against `ModelConfig` (must exist, must be enabled),
2. writes the `ModelRun` row **before** the provider call,
3. snapshots pricing,
4. executes with an `AbortController` timeout and the retry policy,
5. writes usage, cost and status **immediately** on completion — never batched to the end of a council.

## 7. Retry and timeout policy

Retry only: 429, provider 5xx, temporary network errors. Maximum 2 retries, exponential backoff. Never retry: 401, 403, invalid API key, invalid model, validation errors, or an aborted (timed-out) request.

Retries stay inside the same `ModelRun`; `attemptCount` records how many attempts occurred. Timeout duration is server config (`PROVIDER_TIMEOUT_MS`), not scattered constants. A timed-out run is recorded `TIMEOUT` with `errorCode`, `errorMessage` and `latencyMs`; other models continue.

## 8. Council state machine

```
PENDING → ROUND_1 → CRITIQUE → CHAIRMAN → COMPLETED
                                        ↘ PARTIAL
    any stage ↘ FAILED
```

Implemented as four separate modules — `round-one.ts`, `critique.ts`, `chairman.ts`, `orchestrator.ts` — not one large function.

Round 1 runs all members in parallel with `Promise.allSettled`. Each model sees the original question, its assigned role, and council instructions — but never another model's answer, avoiding first-answer anchoring.

Critique anonymizes successful Round 1 responses as "Response A/B/C…". Model identity never appears in a critique or chairman prompt (verified by test). Each critiquer answers six fixed questions: most agreed, most disagreed, flaws per response, unevidenced assumptions, whether its own judgment changed, and its best revised recommendation.

Chairman receives the question, the anonymous Round 1 responses and the anonymous critiques, and must output: Executive Summary, Consensus, Key Disagreements, Key Risks, Recommended Decision, Action Plan, Confidence. The prompt states explicitly that the goal is to make the best decision, not to average all answers.

Failure rules: zero Round 1 successes → `FAILED` with no chairman call; fewer than two usable responses → critique skipped and the chairman prompt says so; any member failure with a successful chairman → `PARTIAL`; chairman failure → `FAILED` with all earlier usage preserved.

## 9. Streaming

Server-Sent Events at `GET /api/council/:runId/stream`. No WebSockets in V1.

Events: `council.started`, `stage.started`, `model.started`, `model.delta`, `model.completed`, `model.failed`, `stage.completed`, `chairman.started`, `chairman.delta`, `chairman.completed`, `council.completed`, `council.failed`. Payloads carry `runId`, `timestamp`, and where applicable `modelRunId`, `provider`, `modelId`, `stage`.

An in-process event hub buffers events per run so a client connecting mid-run gets a replay. If the buffer is empty but the database shows a terminal state (typical after a restart), the stream emits one terminal event and closes.

## 10. V1 reliability constraint

Council execution is in-process. This is explicitly **not** a durable queue. A container restart mid-run interrupts it. `markStaleCouncilRuns` marks any run left in a non-terminal state beyond `COUNCIL_STALE_AFTER_MS` as `FAILED`, and is called on council and session reads. Ledger rows already written are never lost.

Redis / BullMQ / workers are Phase 2 work, deliberately excluded here.

## 11. Usage analytics

`/usage` is V1 scope, not Phase 2.

Overview: total spend, total tokens, total calls, successful calls, failed calls, average latency. Per model: calls, input/output/cached/reasoning/total tokens, input cost, output cost, total cost, average cost per call, average latency, success and failure rate. Date ranges: Today, 7 Days, 30 Days, Custom.

Per council: a line-item cost breakdown by stage and model, plus the total. Per session: total tokens, total cost, model call count, drilling into individual `ModelRun` rows.

All figures are computed from the ledger.

## 12. Security

Server-only: API keys, `DATABASE_URL`, provider SDK calls, cost backend — all under `src/server/*`, never in the browser bundle. Frontend-supplied `provider` / `model` / `sessionId` / `message` are validated with zod, and every model must exist in `ModelConfig` with `enabled = true`. Logs never contain API keys, authorization headers or secrets; they carry request/run identifiers, provider, model, stage, latency and status.

Provider failure never produces a whole-page error — the failing model's card shows its status and error code, and the other models' results remain.

## 13. Testing strategy

Unit tests cover cost calculation (input, output, zero tokens, missing price, cached tokens, reasoning tokens, decimal precision, over-reported cached tokens), provider normalization for every provider with mocked responses, retry policy, the ModelRouter ledger lifecycle, the full council state machine (all success, one failure, all failures, critique skip, chairman failure, timeout, 429 retry), stale-run recovery, and analytics aggregation against fixture ledger rows.

**Automated tests never call real paid AI APIs.** Providers are always mocked.
