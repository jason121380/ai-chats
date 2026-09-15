import type { PrismaClient } from "@prisma/client"

import { calculateCost } from "./calculate-cost"
import { getActivePricing } from "./pricing"

export interface BackfillResult {
  /** Rows that had no cost and now have an estimate. */
  filled: number
  /** Rows still without one, because no price is configured for that model. */
  skipped: number
}

/**
 * Give a cost to calls that were made before their model had a price.
 *
 * The ledger snapshots the rate onto each ModelRun at call time, which is what
 * keeps a price change in 2027 from rewriting a 2026 invoice. A call made
 * before any price existed has no snapshot at all, so 用量 counts it as zero
 * and the meeting it belongs to reads「未設定價格」forever — accurate, and
 * useless.
 *
 * This fills those rows in from the rate in force NOW, and marks them
 * ESTIMATED rather than CALCULATED. The distinction is the point: the number
 * is what the call WOULD have cost at today's published rate, not what it was
 * billed at. Folding it into CALCULATED would make an estimate indistinguishable
 * from a measurement, and nobody would ever be able to tell them apart again.
 *
 * Rows that already have a cost are never touched, whatever the reason they
 * have one. This only ever runs forward, from MISSING.
 */
export async function backfillMissingCosts(
  db: PrismaClient
): Promise<BackfillResult> {
  const runs = await db.modelRun.findMany({
    where: {
      pricingStatus: "MISSING",
      // Nothing to price a call on if the provider never reported tokens.
      OR: [{ inputTokens: { not: null } }, { outputTokens: { not: null } }],
    },
    select: {
      id: true,
      councilRunId: true,
      provider: true,
      modelId: true,
      inputTokens: true,
      outputTokens: true,
      cachedInputTokens: true,
      reasoningTokens: true,
    },
  })

  // CouncilRun carries its own cost total, written once when the meeting
  // finished. Filling in the rows underneath it without refreshing it would
  // leave 討論紀錄 saying $0.00 above a breakdown that now adds up to
  // something — the kind of disagreement that makes a reader distrust both.
  const touchedCouncilRuns = new Set<string>()

  // One price lookup per model, not per row: a discussion is dozens of rows
  // across a handful of models.
  const priceCache = new Map<
    string,
    Awaited<ReturnType<typeof getActivePricing>>
  >()
  let filled = 0
  let skipped = 0

  for (const run of runs) {
    const key = `${run.provider}/${run.modelId}`
    if (!priceCache.has(key)) {
      priceCache.set(key, await getActivePricing(db, run.provider, run.modelId))
    }
    const pricing = priceCache.get(key) ?? null
    if (!pricing) {
      skipped += 1
      continue
    }

    const cost = calculateCost(
      {
        inputTokens: run.inputTokens,
        outputTokens: run.outputTokens,
        cachedInputTokens: run.cachedInputTokens,
        reasoningTokens: run.reasoningTokens,
      },
      pricing
    )
    if (cost.totalCostUsd === null) {
      skipped += 1
      continue
    }

    await db.modelRun.update({
      where: { id: run.id },
      data: {
        inputPricePerMillionUsd: pricing.inputPerMillionUsd.toString(),
        outputPricePerMillionUsd: pricing.outputPerMillionUsd.toString(),
        cachedInputPricePerMillionUsd:
          pricing.cachedInputPerMillionUsd?.toString() ?? null,
        reasoningPricePerMillionUsd:
          pricing.reasoningPerMillionUsd?.toString() ?? null,
        inputCostUsd: cost.inputCostUsd?.toString() ?? null,
        outputCostUsd: cost.outputCostUsd?.toString() ?? null,
        cachedInputCostUsd: cost.cachedInputCostUsd?.toString() ?? null,
        reasoningCostUsd: cost.reasoningCostUsd?.toString() ?? null,
        totalCostUsd: cost.totalCostUsd.toString(),
        pricingStatus: "ESTIMATED",
        pricingEffectiveAt: pricing.effectiveAt,
        // Says plainly, in the row itself, that this rate post-dates the call.
        pricingSource: `事後估算（價格設定於通話之後）：${pricing.source ?? "manual"}`,
      },
    })
    filled += 1
    if (run.councilRunId) touchedCouncilRuns.add(run.councilRunId)
  }

  for (const councilRunId of Array.from(touchedCouncilRuns)) {
    await recomputeCouncilRunCost(db, councilRunId)
  }

  return { filled, skipped }
}

/**
 * Re-add a meeting's model calls into its stored total.
 *
 * Deliberately narrower than finalizeRun, which also writes `status` and
 * `completedAt`: this runs long after a meeting ended and must not restate
 * when it ended or how it went.
 */
async function recomputeCouncilRunCost(
  db: PrismaClient,
  councilRunId: string
): Promise<void> {
  const rows = await db.modelRun.findMany({
    where: { councilRunId },
    select: { totalCostUsd: true },
  })
  const { default: Decimal } = await import("decimal.js")
  let cost = new Decimal(0)
  let known = false
  for (const row of rows) {
    if (row.totalCostUsd === null) continue
    known = true
    cost = cost.add(row.totalCostUsd.toString())
  }
  await db.councilRun.update({
    where: { id: councilRunId },
    data: { totalCostUsd: known ? cost.toString() : null },
  })
}
