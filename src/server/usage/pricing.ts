import Decimal from "decimal.js"
import type { PrismaClient, ProviderName } from "@prisma/client"

import type { PricingSnapshot } from "./types"

/**
 * Look up the pricing row in force for provider+modelId at `at` (default now):
 *   effectiveFrom <= at AND (effectiveTo IS NULL OR effectiveTo > at)
 * Latest effectiveFrom wins. Returns null when no price is configured —
 * callers must treat that as pricingStatus MISSING, never as an error.
 */
export async function getActivePricing(
  db: PrismaClient,
  provider: ProviderName,
  modelId: string,
  at: Date = new Date()
): Promise<PricingSnapshot | null> {
  const row = await db.modelPricing.findFirst({
    where: {
      provider,
      modelId,
      effectiveFrom: { lte: at },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: at } }],
    },
    orderBy: { effectiveFrom: "desc" },
  })

  if (!row) return null

  return {
    inputPerMillionUsd: new Decimal(row.inputPerMillion.toString()),
    outputPerMillionUsd: new Decimal(row.outputPerMillion.toString()),
    cachedInputPerMillionUsd: row.cachedInputPerMillion
      ? new Decimal(row.cachedInputPerMillion.toString())
      : null,
    reasoningPerMillionUsd: row.reasoningPerMillion
      ? new Decimal(row.reasoningPerMillion.toString())
      : null,
    effectiveAt: row.effectiveFrom,
    source: row.source,
  }
}
