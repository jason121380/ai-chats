import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Every amount in this app is US dollars: that is how all four providers
 * publish their rates, and ModelPricing stores them unconverted.
 *
 * Prefixed "US$", not "$". A bare $ is read as NT$ by everyone using this
 * in Taiwan, and the gap between NT$0.02 and US$0.02 is a factor of thirty —
 * large enough to matter and small enough that nobody would notice being
 * wrong. The unit travels with the number instead of sitting in a column
 * header three rows away.
 *
 * Precision adapts to magnitude so tiny per-request costs are not rounded
 * away to zero.
 */
export const CURRENCY_PREFIX = "US$"

export function formatUsd(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "—"
  const n = typeof value === "string" ? Number(value) : value
  if (!Number.isFinite(n)) return "—"
  return `${CURRENCY_PREFIX}${scaled(n)}`
}

export const TWD_PREFIX = "NT$"

/**
 * The same amount in New Taiwan dollars.
 *
 * `rate` is NT dollars per 1 US dollar, and when it is null this falls back
 * to US$ rather than guessing one. That fallback is not a degraded mode: US$
 * is the currency the amount is actually stored and billed in, so showing it
 * is the correct answer to "we do not know today's rate", and a plausible
 * NT$ figure derived from a made-up rate would be the wrong one.
 *
 * Conversion never touches stored data. Every cost column stays US$ forever;
 * changing the rate changes the display and nothing else, which is why a
 * wrong rate is recoverable and a converted ledger would not be.
 */
export function formatTwd(
  value: string | number | null | undefined,
  rate: string | number | null | undefined
): string {
  if (value === null || value === undefined) return "—"
  const n = typeof value === "string" ? Number(value) : value
  if (!Number.isFinite(n)) return "—"
  const r = typeof rate === "string" ? Number(rate) : rate
  if (r === null || r === undefined || !Number.isFinite(r) || r <= 0) {
    return `${CURRENCY_PREFIX}${scaled(n)}`
  }
  return `${TWD_PREFIX}${scaled(n * r)}`
}

/**
 * Precision that adapts to magnitude, so a single cheap call does not round
 * away to zero and read as free. A per-turn cost can be four decimal places
 * into a New Taiwan dollar; showing it to two would report most of this
 * app's amounts as NT$0.00.
 */
function scaled(n: number): string {
  if (n === 0) return "0"
  const abs = Math.abs(n)
  if (abs >= 1) return n.toFixed(2)
  if (abs >= 0.01) return n.toFixed(4)
  return n.toFixed(6)
}

export function formatTokens(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—"
  return value.toLocaleString("en-US")
}

export function formatLatency(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return "—"
  if (ms < 1000) return `${ms} ms`
  return `${(ms / 1000).toFixed(1)} s`
}
