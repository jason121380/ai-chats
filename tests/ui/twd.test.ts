import { describe, expect, it } from "vitest"

import { formatTwd, formatUsd } from "@/lib/utils"
import { daysSince, RATE_STALE_DAYS } from "@/components/models/currency-setting"
import { NO_RATE } from "@/server/usage/currency"

/**
 * Showing US dollar amounts in New Taiwan dollars.
 *
 * The rule these tests exist to hold: the app never invents a rate. An
 * exchange rate it made up would look exactly like one it had checked,
 * would be wrong by a little more every day, and would produce figures with
 * nothing about them to say so. Without a rate, amounts stay in US$ — which
 * is what they actually are, so the fallback is correct and not merely safe.
 */
describe("converting to New Taiwan dollars", () => {
  it("converts at the given rate", () => {
    expect(formatTwd(1, "31.5")).toBe("NT$31.50")
    expect(formatTwd("0.0128", "31.5")).toBe("NT$0.4032")
  })

  it("keeps a per-call cost from rounding away to nothing", () => {
    // US$0.00044 is NT$0.0139. At two decimal places that reads NT$0.01, and
    // a cheaper call reads NT$0.00 — which is "free", not "nearly nothing".
    expect(formatTwd("0.00044", "31.5")).toBe("NT$0.0139")
    // And a genuinely tiny one still carries digits rather than collapsing.
    expect(formatTwd("0.0000002", "31.5")).toBe("NT$0.000006")
    expect(formatTwd("0.0000002", "31.5")).not.toBe("NT$0")
  })

  it("falls back to US$ when no rate is set, rather than guessing one", () => {
    expect(formatTwd("0.0128", null)).toBe("US$0.0128")
    expect(formatTwd("0.0128", undefined)).toBe("US$0.0128")
    expect(NO_RATE.usdToTwd).toBeNull()
  })

  it("refuses a nonsense rate instead of producing a nonsense amount", () => {
    for (const bad of ["0", "-5", "abc", ""]) {
      expect(formatTwd("1", bad)).toBe("US$1.00")
    }
  })

  it("still shows an unknown amount as a dash, not as zero", () => {
    expect(formatTwd(null, "31.5")).toBe("—")
    expect(formatTwd(undefined, "31.5")).toBe("—")
  })

  it("leaves formatUsd alone — the ledger is still US dollars", () => {
    expect(formatUsd("0.0128")).toBe("US$0.0128")
  })

  it("marks NT$ and US$ differently, so a screenshot is never ambiguous", () => {
    expect(formatTwd(1, "31.5").startsWith("NT$")).toBe(true)
    expect(formatTwd(1, null).startsWith("US$")).toBe(true)
  })
})

describe("the rate's age", () => {
  const now = new Date("2026-09-15T12:00:00Z")

  it("counts whole days since it was set", () => {
    expect(daysSince("2026-09-15T00:00:00Z", now)).toBe(0)
    expect(daysSince("2026-09-14T00:00:00Z", now)).toBe(1)
    expect(daysSince("2026-08-15T00:00:00Z", now)).toBe(31)
  })

  it("never reports a negative age for a clock that is ahead", () => {
    expect(daysSince("2026-09-20T00:00:00Z", now)).toBe(0)
  })

  it("calls a month-old rate stale, because a few percent is a few percent", () => {
    expect(daysSince("2026-08-15T00:00:00Z", now)).toBeGreaterThanOrEqual(
      RATE_STALE_DAYS
    )
    expect(daysSince("2026-09-10T00:00:00Z", now)).toBeLessThan(RATE_STALE_DAYS)
  })
})
