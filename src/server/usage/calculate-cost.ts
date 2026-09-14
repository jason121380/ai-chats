import Decimal from "decimal.js"

import type {
  BillableUsage,
  CostBreakdown,
  PricingSnapshot,
} from "./types"

const MILLION = new Decimal(1_000_000)

function tokensCost(tokens: number, pricePerMillion: Decimal): Decimal {
  return new Decimal(tokens).div(MILLION).mul(pricePerMillion)
}

/**
 * Central cost calculator. ALL cost math lives here — provider adapters
 * never compute money.
 *
 * Rules:
 * - No pricing snapshot → every cost field is null, status MISSING.
 *   The AI request itself must still succeed.
 * - Token counts are provider-reported. If neither input nor output token
 *   count is known, no cost can be computed → status MISSING.
 * - Cached input tokens are billed at the cached rate ONLY when the provider
 *   reported them AND the pricing snapshot has a cached price. They are a
 *   subset of inputTokens, so the input cost is computed on
 *   (inputTokens - cachedInputTokens) to avoid double counting.
 *   Without a cached price, all input tokens bill at the input rate.
 * - Reasoning tokens follow the same subset rule against outputTokens.
 * - Money is Decimal end to end. Never floats.
 */
export function calculateCost(
  usage: BillableUsage,
  pricing: PricingSnapshot | null
): CostBreakdown {
  if (!pricing) {
    return {
      inputCostUsd: null,
      outputCostUsd: null,
      cachedInputCostUsd: null,
      reasoningCostUsd: null,
      totalCostUsd: null,
      pricingStatus: "MISSING",
    }
  }

  const { inputTokens, outputTokens, cachedInputTokens, reasoningTokens } =
    usage

  if (inputTokens === null && outputTokens === null) {
    return {
      inputCostUsd: null,
      outputCostUsd: null,
      cachedInputCostUsd: null,
      reasoningCostUsd: null,
      totalCostUsd: null,
      pricingStatus: "MISSING",
    }
  }

  let inputCostUsd: Decimal | null = null
  let cachedInputCostUsd: Decimal | null = null
  let outputCostUsd: Decimal | null = null
  let reasoningCostUsd: Decimal | null = null

  if (inputTokens !== null) {
    const useCachedRate =
      cachedInputTokens !== null &&
      cachedInputTokens > 0 &&
      pricing.cachedInputPerMillionUsd !== null

    if (useCachedRate) {
      const cached = Math.min(cachedInputTokens, inputTokens)
      const uncached = inputTokens - cached
      inputCostUsd = tokensCost(uncached, pricing.inputPerMillionUsd)
      cachedInputCostUsd = tokensCost(
        cached,
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        pricing.cachedInputPerMillionUsd!
      )
    } else {
      inputCostUsd = tokensCost(inputTokens, pricing.inputPerMillionUsd)
    }
  }

  if (outputTokens !== null) {
    const useReasoningRate =
      reasoningTokens !== null &&
      reasoningTokens > 0 &&
      pricing.reasoningPerMillionUsd !== null

    if (useReasoningRate) {
      const reasoning = Math.min(reasoningTokens, outputTokens)
      const plain = outputTokens - reasoning
      outputCostUsd = tokensCost(plain, pricing.outputPerMillionUsd)
      reasoningCostUsd = tokensCost(
        reasoning,
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        pricing.reasoningPerMillionUsd!
      )
    } else {
      outputCostUsd = tokensCost(outputTokens, pricing.outputPerMillionUsd)
    }
  }

  let total = new Decimal(0)
  for (const part of [
    inputCostUsd,
    cachedInputCostUsd,
    outputCostUsd,
    reasoningCostUsd,
  ]) {
    if (part !== null) total = total.add(part)
  }

  return {
    inputCostUsd,
    outputCostUsd,
    cachedInputCostUsd,
    reasoningCostUsd,
    totalCostUsd: total,
    pricingStatus: "CALCULATED",
  }
}
