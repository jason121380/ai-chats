import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Format a USD amount with precision that adapts to magnitude,
 * so tiny per-request costs are not rounded away to $0.
 */
export function formatUsd(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "—"
  const n = typeof value === "string" ? Number(value) : value
  if (!Number.isFinite(n)) return "—"
  if (n === 0) return "$0"
  const abs = Math.abs(n)
  if (abs >= 1) return `$${n.toFixed(2)}`
  if (abs >= 0.01) return `$${n.toFixed(4)}`
  return `$${n.toFixed(6)}`
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
