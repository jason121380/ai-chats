import { describe, expect, it } from "vitest"
import Decimal from "decimal.js"

import { calculateCost } from "@/server/usage/calculate-cost"
import type { BillableUsage, PricingSnapshot } from "@/server/usage/types"

function pricing(overrides: Partial<PricingSnapshot> = {}): PricingSnapshot {
  return {
    inputPerMillionUsd: new Decimal(2.5),
    outputPerMillionUsd: new Decimal(10),
    cachedInputPerMillionUsd: null,
    reasoningPerMillionUsd: null,
    effectiveAt: new Date("2026-01-01T00:00:00Z"),
    source: "test",
    ...overrides,
  }
}

function usage(overrides: Partial<BillableUsage> = {}): BillableUsage {
  return {
    inputTokens: null,
    outputTokens: null,
    cachedInputTokens: null,
    reasoningTokens: null,
    ...overrides,
  }
}

describe("calculateCost", () => {
  it("calculates input token cost", () => {
    const result = calculateCost(
      usage({ inputTokens: 1_000_000, outputTokens: 0 }),
      pricing()
    )
    expect(result.pricingStatus).toBe("CALCULATED")
    expect(result.inputCostUsd?.toString()).toBe("2.5")
    expect(result.outputCostUsd?.toString()).toBe("0")
    expect(result.totalCostUsd?.toString()).toBe("2.5")
  })

  it("calculates output token cost", () => {
    const result = calculateCost(
      usage({ inputTokens: 0, outputTokens: 500_000 }),
      pricing()
    )
    expect(result.outputCostUsd?.toString()).toBe("5")
    expect(result.totalCostUsd?.toString()).toBe("5")
  })

  it("handles zero tokens", () => {
    const result = calculateCost(
      usage({ inputTokens: 0, outputTokens: 0 }),
      pricing()
    )
    expect(result.pricingStatus).toBe("CALCULATED")
    expect(result.totalCostUsd?.toString()).toBe("0")
  })

  it("returns MISSING with null costs when there is no pricing", () => {
    const result = calculateCost(
      usage({ inputTokens: 1000, outputTokens: 1000 }),
      null
    )
    expect(result.pricingStatus).toBe("MISSING")
    expect(result.inputCostUsd).toBeNull()
    expect(result.outputCostUsd).toBeNull()
    expect(result.totalCostUsd).toBeNull()
  })

  it("returns MISSING when the provider reported no token usage at all", () => {
    const result = calculateCost(usage(), pricing())
    expect(result.pricingStatus).toBe("MISSING")
    expect(result.totalCostUsd).toBeNull()
  })

  it("bills cached input tokens at the cached rate without double counting", () => {
    const result = calculateCost(
      usage({
        inputTokens: 1_000_000,
        cachedInputTokens: 400_000,
        outputTokens: 0,
      }),
      pricing({ cachedInputPerMillionUsd: new Decimal(1.25) })
    )
    // uncached: 600k @ 2.5/M = 1.5 ; cached: 400k @ 1.25/M = 0.5
    expect(result.inputCostUsd?.toString()).toBe("1.5")
    expect(result.cachedInputCostUsd?.toString()).toBe("0.5")
    expect(result.totalCostUsd?.toString()).toBe("2")
  })

  it("bills all input at the input rate when no cached price is configured", () => {
    const result = calculateCost(
      usage({
        inputTokens: 1_000_000,
        cachedInputTokens: 400_000,
        outputTokens: 0,
      }),
      pricing()
    )
    expect(result.inputCostUsd?.toString()).toBe("2.5")
    expect(result.cachedInputCostUsd).toBeNull()
    expect(result.totalCostUsd?.toString()).toBe("2.5")
  })

  it("bills reasoning tokens separately only when a reasoning price exists", () => {
    const result = calculateCost(
      usage({
        inputTokens: 0,
        outputTokens: 1_000_000,
        reasoningTokens: 250_000,
      }),
      pricing({ reasoningPerMillionUsd: new Decimal(40) })
    )
    // plain output: 750k @ 10/M = 7.5 ; reasoning: 250k @ 40/M = 10
    expect(result.outputCostUsd?.toString()).toBe("7.5")
    expect(result.reasoningCostUsd?.toString()).toBe("10")
    expect(result.totalCostUsd?.toString()).toBe("17.5")
  })

  it("keeps decimal precision for tiny costs (no premature rounding to 0)", () => {
    const result = calculateCost(
      usage({ inputTokens: 7, outputTokens: 3 }),
      pricing({
        inputPerMillionUsd: new Decimal("0.15"),
        outputPerMillionUsd: new Decimal("0.6"),
      })
    )
    // 7/1M * 0.15 = 0.00000105 ; 3/1M * 0.6 = 0.0000018
    expect(result.inputCostUsd?.toString()).toBe("0.00000105")
    expect(result.outputCostUsd?.toString()).toBe("0.0000018")
    expect(result.totalCostUsd?.toString()).toBe("0.00000285")
    expect(result.totalCostUsd?.greaterThan(0)).toBe(true)
  })

  it("clamps cached tokens to inputTokens if a provider over-reports", () => {
    const result = calculateCost(
      usage({ inputTokens: 100, cachedInputTokens: 500, outputTokens: 0 }),
      pricing({ cachedInputPerMillionUsd: new Decimal(1) })
    )
    expect(result.inputCostUsd?.toString()).toBe("0")
    expect(result.cachedInputCostUsd?.toString()).toBe("0.0001")
  })
})
