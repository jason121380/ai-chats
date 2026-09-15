import { describe, expect, it } from "vitest"

import { CURRENCY_PREFIX, formatUsd } from "@/lib/utils"

/**
 * Every amount in this app is US dollars — all four providers publish their
 * rates that way and ModelPricing stores them unconverted.
 *
 * A bare "$" does not say that. Read in Taiwan it is NT$, and NT$0.02 against
 * US$0.02 is a factor of about thirty: far enough apart to matter when someone
 * decides whether a model is affordable, close enough that nothing about the
 * number would look wrong. The unit belongs on the number, not in a column
 * header three rows away.
 */
describe("amounts say which dollars they are", () => {
  it("marks the currency on every magnitude", () => {
    expect(formatUsd(0)).toBe("US$0")
    expect(formatUsd(12)).toBe("US$12.00")
    expect(formatUsd(0.0184)).toBe("US$0.0184")
    expect(formatUsd(0.00044)).toBe("US$0.000440")
  })

  it("never renders a bare dollar sign", () => {
    for (const value of [0, 0.000001, 0.5, 1, 1234.5]) {
      expect(formatUsd(value).startsWith(CURRENCY_PREFIX)).toBe(true)
      expect(formatUsd(value)).not.toMatch(/^\$/)
    }
  })

  it("keeps a small cost from rounding away to zero", () => {
    // A single cheap call must not read as free; that is the whole reason
    // precision scales with magnitude.
    expect(formatUsd(0.0000004)).not.toBe("US$0")
  })

  it("shows an unknown amount as a dash, not as zero", () => {
    expect(formatUsd(null)).toBe("—")
    expect(formatUsd(undefined)).toBe("—")
    expect(formatUsd("not a number")).toBe("—")
  })
})
