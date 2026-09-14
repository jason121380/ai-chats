import type {
  CouncilRole,
  ModelRunStage,
  PrismaClient,
  Prisma,
} from "@prisma/client"

import { getEnv } from "@/lib/env"
import { calculateCost } from "@/server/usage/calculate-cost"
import { getActivePricing } from "@/server/usage/pricing"
import type { PricingSnapshot } from "@/server/usage/types"
import type { ProviderRegistry } from "./registry"
import type { AIMessage, AIResponse, ProviderName } from "./types"
import { ProviderError } from "./types"
import { withRetries, type RetryOptions } from "./retry"

export interface ModelCallSpec {
  sessionId: string
  councilRunId?: string | null
  provider: ProviderName
  modelId: string
  stage: ModelRunStage
  role?: CouncilRole
  /** DISCUSSION only: speaking order within the run. */
  roundNumber?: number
  turnIndex?: number
  messages: AIMessage[]
  systemPrompt?: string
  temperature?: number
  maxOutputTokens?: number
}

export interface ModelRunOutcome {
  modelRunId: string
  status: "COMPLETED" | "FAILED" | "TIMEOUT"
  provider: ProviderName
  modelId: string
  stage: ModelRunStage
  role: CouncilRole
  response?: AIResponse
  latencyMs: number
  errorCode?: string
  errorMessage?: string
}

export interface ModelRouterDeps {
  db: PrismaClient
  registry: ProviderRegistry
  timeoutMs?: number
  retry?: RetryOptions
  now?: () => Date
}

function serializePrompt(spec: ModelCallSpec): string {
  const parts: string[] = []
  if (spec.systemPrompt) parts.push(`[system]\n${spec.systemPrompt}`)
  for (const m of spec.messages) parts.push(`[${m.role}]\n${m.content}`)
  return parts.join("\n\n")
}

function toJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined
  try {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
  } catch {
    return undefined
  }
}

/**
 * ModelRouter — the single path through which EVERY billable AI call flows
 * (Solo, Compare, Council Round 1, Critique, Chairman).
 *
 * Guarantees:
 * - Exactly one auditable ModelRun record per logical model operation
 *   (retries stay within the same ModelRun; attemptCount records them).
 * - The ModelRun row is written to the database BEFORE the provider call
 *   and updated IMMEDIATELY after it finishes — never batched to the end
 *   of a council, so usage survives later failures.
 * - Pricing is snapshotted at call time; a missing price NEVER fails the
 *   request (pricingStatus = MISSING).
 * - Every provider request has a timeout; timeouts mark the run TIMEOUT.
 */
export async function executeModelRun(
  spec: ModelCallSpec,
  deps: ModelRouterDeps
): Promise<ModelRunOutcome> {
  const { db, registry } = deps
  const now = deps.now ?? (() => new Date())
  const timeoutMs = deps.timeoutMs ?? getEnv().PROVIDER_TIMEOUT_MS
  const role = spec.role ?? "GENERAL"

  // Validate against ModelConfig: the model must exist and be enabled.
  const config = await db.modelConfig.findUnique({
    where: {
      provider_modelId: { provider: spec.provider, modelId: spec.modelId },
    },
  })
  if (!config || !config.enabled) {
    throw new Error(
      `Model ${spec.provider}/${spec.modelId} is not configured or not enabled`
    )
  }

  const temperature = spec.temperature ?? config.temperature ?? undefined
  const maxOutputTokens =
    spec.maxOutputTokens ?? config.maxOutputTokens ?? undefined

  const startedAt = now()

  // 1. Create the ledger row before calling the provider.
  const run = await db.modelRun.create({
    data: {
      sessionId: spec.sessionId,
      councilRunId: spec.councilRunId ?? null,
      provider: spec.provider,
      modelId: spec.modelId,
      stage: spec.stage,
      role,
      status: "RUNNING",
      prompt: serializePrompt(spec),
      startedAt,
      roundNumber: spec.roundNumber ?? null,
      turnIndex: spec.turnIndex ?? null,
    },
  })

  // 2. Pricing snapshot at call time.
  let pricing: PricingSnapshot | null = null
  try {
    pricing = await getActivePricing(db, spec.provider, spec.modelId, startedAt)
  } catch {
    pricing = null
  }

  const finish = async (
    data: Prisma.ModelRunUpdateInput
  ): Promise<void> => {
    await db.modelRun.update({ where: { id: run.id }, data })
  }

  // 3. Execute with timeout + retry.
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  let response: AIResponse | undefined
  let attemptCount = 1
  let failure: { code: string; message: string; timedOut: boolean } | null =
    null

  try {
    const provider = registry.get(spec.provider)
    const outcome = await withRetries(
      () =>
        provider.generate({
          model: spec.modelId,
          messages: spec.messages,
          systemPrompt: spec.systemPrompt,
          temperature,
          maxOutputTokens,
          signal: controller.signal,
        }),
      deps.retry
    )
    response = outcome.result
    attemptCount = outcome.attemptCount
  } catch (err) {
    const timedOut = controller.signal.aborted
    if (err instanceof ProviderError) {
      failure = {
        code: timedOut ? "TIMEOUT" : err.code,
        message: err.message,
        timedOut,
      }
    } else if (err instanceof Error) {
      failure = {
        code: timedOut ? "TIMEOUT" : "UNKNOWN",
        message: err.message,
        timedOut,
      }
    } else {
      failure = { code: "UNKNOWN", message: String(err), timedOut }
    }
  } finally {
    clearTimeout(timer)
  }

  const completedAt = now()
  const latencyMs = Math.max(0, completedAt.getTime() - startedAt.getTime())

  if (failure) {
    const status = failure.timedOut ? "TIMEOUT" : "FAILED"
    await finish({
      status,
      completedAt,
      latencyMs,
      attemptCount,
      errorCode: failure.code,
      errorMessage: failure.message,
    })
    return {
      modelRunId: run.id,
      status,
      provider: spec.provider,
      modelId: spec.modelId,
      stage: spec.stage,
      role,
      latencyMs,
      errorCode: failure.code,
      errorMessage: failure.message,
    }
  }

  // 4. Cost from provider-reported usage + pricing snapshot.
  const usage = response!.usage
  const cost = calculateCost(
    {
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cachedInputTokens: usage.cachedInputTokens,
      reasoningTokens: usage.reasoningTokens,
    },
    pricing
  )

  await finish({
    status: "COMPLETED",
    response: response!.content,
    completedAt,
    latencyMs,
    attemptCount,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    totalTokens: usage.totalTokens,
    cachedInputTokens: usage.cachedInputTokens,
    reasoningTokens: usage.reasoningTokens,
    providerRequestId: response!.providerRequestId,
    finishReason: response!.finishReason,
    rawUsage: toJson(usage.rawUsage),
    rawResponseMetadata: toJson(response!.metadata),
    inputPricePerMillionUsd: pricing?.inputPerMillionUsd.toString(),
    outputPricePerMillionUsd: pricing?.outputPerMillionUsd.toString(),
    cachedInputPricePerMillionUsd:
      pricing?.cachedInputPerMillionUsd?.toString() ?? null,
    reasoningPricePerMillionUsd:
      pricing?.reasoningPerMillionUsd?.toString() ?? null,
    inputCostUsd: cost.inputCostUsd?.toString() ?? null,
    outputCostUsd: cost.outputCostUsd?.toString() ?? null,
    cachedInputCostUsd: cost.cachedInputCostUsd?.toString() ?? null,
    reasoningCostUsd: cost.reasoningCostUsd?.toString() ?? null,
    totalCostUsd: cost.totalCostUsd?.toString() ?? null,
    pricingStatus: cost.pricingStatus,
    pricingEffectiveAt: pricing?.effectiveAt ?? null,
    pricingSource: pricing?.source ?? null,
  })

  return {
    modelRunId: run.id,
    status: "COMPLETED",
    provider: spec.provider,
    modelId: spec.modelId,
    stage: spec.stage,
    role,
    response,
    latencyMs,
  }
}
