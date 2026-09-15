import Decimal from "decimal.js"

export type PricingStatusValue =
  | "CALCULATED"
  | "ESTIMATED"
  | "MISSING"
  | "UNSUPPORTED"

/**
 * The price in force at the moment an AI call is made.
 * Snapshotted onto the ModelRun so later price changes never
 * pollute historical cost records.
 */
export interface PricingSnapshot {
  inputPerMillionUsd: Decimal
  outputPerMillionUsd: Decimal
  cachedInputPerMillionUsd: Decimal | null
  reasoningPerMillionUsd: Decimal | null
  effectiveAt: Date
  source: string | null
}

/**
 * Token counts used for cost calculation. Values are null when the
 * provider did not report them — we never guess token counts.
 *
 * Normalization contract (enforced by provider adapters):
 * - cachedInputTokens, when present, is a SUBSET of inputTokens.
 * - reasoningTokens, when present, is a SUBSET of outputTokens.
 */
export interface BillableUsage {
  inputTokens: number | null
  outputTokens: number | null
  cachedInputTokens: number | null
  reasoningTokens: number | null
}

export interface CostBreakdown {
  inputCostUsd: Decimal | null
  outputCostUsd: Decimal | null
  cachedInputCostUsd: Decimal | null
  reasoningCostUsd: Decimal | null
  totalCostUsd: Decimal | null
  pricingStatus: PricingStatusValue
}
