import type { CouncilRole, PrismaClient } from "@prisma/client"

import { getEnv } from "@/lib/env"
import type { ModelRouterDeps } from "@/server/ai/router"
import { emitCouncilEvent } from "./events"
import { runRoundOne } from "./round-one"
import { anonymize, runCritique } from "./critique"
import { runChairman } from "./chairman"
import type { CouncilConfig } from "./types"

/**
 * Council state machine:
 *
 *   PENDING → ROUND_1 → CRITIQUE → CHAIRMAN → COMPLETED
 *                                           ↘ PARTIAL (some members failed)
 *   Any stage may end in FAILED (no Round 1 successes, or chairman failure).
 *
 * Every stage transition is persisted immediately; ModelRun rows are written
 * by the router as each call finishes, so cost/usage survive later failures.
 */
export async function runCouncil(
  config: CouncilConfig,
  deps: ModelRouterDeps
): Promise<void> {
  const { db } = deps

  const setStage = (
    status: "ROUND_1" | "CRITIQUE" | "CHAIRMAN",
    stage: "ROUND_1" | "CRITIQUE" | "CHAIRMAN"
  ) =>
    db.councilRun.update({
      where: { id: config.runId },
      data: { status, currentStage: stage },
    })

  emitCouncilEvent({ type: "council.started", runId: config.runId })

  try {
    // Default roles come from ModelConfig, overridable per request.
    const configs = await db.modelConfig.findMany({
      where: {
        OR: config.models.map((m) => ({
          provider: m.provider,
          modelId: m.modelId,
        })),
      },
    })
    const roles = new Map<string, CouncilRole>(
      configs.map((c) => [`${c.provider}/${c.modelId}`, c.defaultRole])
    )

    await db.councilRun.update({
      where: { id: config.runId },
      data: { status: "ROUND_1", currentStage: "ROUND_1", startedAt: new Date() },
    })

    // ── Round 1
    emitCouncilEvent({
      type: "stage.started",
      runId: config.runId,
      stage: "ROUND_1",
    })
    const roundOne = await runRoundOne(config, roles, deps)
    emitCouncilEvent({
      type: "stage.completed",
      runId: config.runId,
      stage: "ROUND_1",
    })

    if (roundOne.responses.length === 0) {
      await finalize(db, config.runId, "FAILED", "All Round 1 models failed")
      emitCouncilEvent({
        type: "council.failed",
        runId: config.runId,
        error: "All Round 1 models failed",
      })
      return
    }

    const labeled = anonymize(roundOne.responses)

    // ── Critique (skipped when too few responses are available)
    await setStage("CRITIQUE", "CRITIQUE")
    emitCouncilEvent({
      type: "stage.started",
      runId: config.runId,
      stage: "CRITIQUE",
    })
    const critique = await runCritique(config, labeled, deps)
    emitCouncilEvent({
      type: "stage.completed",
      runId: config.runId,
      stage: "CRITIQUE",
    })

    // ── Chairman
    await setStage("CHAIRMAN", "CHAIRMAN")
    const chairman = await runChairman(
      config,
      labeled,
      critique.critiques,
      deps
    )

    if (chairman.failed || !chairman.content) {
      await finalize(
        db,
        config.runId,
        "FAILED",
        `Chairman failed: ${chairman.errorMessage ?? "unknown error"}`
      )
      emitCouncilEvent({
        type: "council.failed",
        runId: config.runId,
        error: chairman.errorMessage ?? "Chairman failed",
      })
      return
    }

    // Chairman final answer becomes a first-class conversation message.
    await db.message.create({
      data: {
        sessionId: config.sessionId,
        role: "ASSISTANT",
        source: "CHAIRMAN",
        content: chairman.content,
        modelRunId: chairman.modelRunId,
      },
    })

    const hadFailures =
      roundOne.failures > 0 || (!critique.skipped && critique.failures > 0)

    await finalize(db, config.runId, hadFailures ? "PARTIAL" : "COMPLETED")
    emitCouncilEvent({ type: "council.completed", runId: config.runId })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await finalize(db, config.runId, "FAILED", message).catch(() => {})
    emitCouncilEvent({
      type: "council.failed",
      runId: config.runId,
      error: message,
    })
  }
}

/**
 * Persist terminal status and aggregate totals from the ModelRun ledger.
 * CouncilRun totals are a convenience snapshot; ModelRun remains the
 * authoritative billing ledger.
 */
async function finalize(
  db: PrismaClient,
  runId: string,
  status: "COMPLETED" | "PARTIAL" | "FAILED",
  errorMessage?: string
): Promise<void> {
  const runs = await db.modelRun.findMany({
    where: { councilRunId: runId },
    select: {
      inputTokens: true,
      outputTokens: true,
      cachedInputTokens: true,
      reasoningTokens: true,
      totalTokens: true,
      totalCostUsd: true,
      latencyMs: true,
    },
  })

  let totalInput = 0
  let totalOutput = 0
  let totalCached = 0
  let totalReasoning = 0
  let totalTokens = 0
  let totalLatency = 0
  let costKnown = false
  let totalCost = "0"
  const { default: Decimal } = await import("decimal.js")
  let cost = new Decimal(0)

  for (const r of runs) {
    totalInput += r.inputTokens ?? 0
    totalOutput += r.outputTokens ?? 0
    totalCached += r.cachedInputTokens ?? 0
    totalReasoning += r.reasoningTokens ?? 0
    totalTokens += r.totalTokens ?? 0
    totalLatency += r.latencyMs ?? 0
    if (r.totalCostUsd !== null) {
      costKnown = true
      cost = cost.add(r.totalCostUsd.toString())
    }
  }
  totalCost = cost.toString()

  await db.councilRun.update({
    where: { id: runId },
    data: {
      status,
      completedAt: new Date(),
      totalInputTokens: totalInput,
      totalOutputTokens: totalOutput,
      totalCachedInputTokens: totalCached,
      totalReasoningTokens: totalReasoning,
      totalTokens,
      totalLatencyMs: totalLatency,
      totalCostUsd: costKnown ? totalCost : null,
      errorMessage: errorMessage ?? null,
    },
  })
}

const NON_TERMINAL = ["PENDING", "ROUND_1", "CRITIQUE", "CHAIRMAN"] as const

/**
 * Stale-run recovery: council execution is in-process (no durable queue), so
 * a container restart can strand a run in a non-terminal state. Any such run
 * whose last update is older than COUNCIL_STALE_AFTER_MS is marked FAILED.
 * Call before reading runs.
 */
export async function markStaleCouncilRuns(
  db: PrismaClient,
  staleAfterMs = getEnv().COUNCIL_STALE_AFTER_MS
): Promise<number> {
  const cutoff = new Date(Date.now() - staleAfterMs)
  const result = await db.councilRun.updateMany({
    where: {
      status: { in: [...NON_TERMINAL] },
      updatedAt: { lt: cutoff },
    },
    data: {
      status: "FAILED",
      errorMessage:
        "Run became stale (likely interrupted by a server restart) and was marked FAILED.",
    },
  })
  return result.count
}
