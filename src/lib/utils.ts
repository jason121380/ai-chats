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
  if (n === 0) return `${CURRENCY_PREFIX}0`
  const abs = Math.abs(n)
  if (abs >= 1) return `${CURRENCY_PREFIX}${n.toFixed(2)}`
  if (abs >= 0.01) return `${CURRENCY_PREFIX}${n.toFixed(4)}`
  return `${CURRENCY_PREFIX}${n.toFixed(6)}`
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
