import type { ProviderName } from "@prisma/client"

/**
 * Published list prices, USD per 1M tokens, checked 2026-09-15.
 *
 * This file is a FORM PREFILL, not a price source. Cost math still reads
 * ModelPricing rows from the database and snapshots them onto each ModelRun —
 * that indirection is what keeps a 2027 price change from rewriting a 2026
 * invoice, and nothing here is allowed to shortcut it.
 *
 * Every entry carries where the number came from, because these move: OpenAI
 * cut Terra and Luna on 2026-07-30 and put Sol on a promotional rate on
 * 2026-08-21. A price in this file is right on the day it was written and
 * decays from there; the `source` string travels into the database row so the
 * ledger records what was believed and when.
 *
 * Models are listed ONLY where the rate could be corroborated. A guessed price
 * does not read as a guess once it is in the ledger — it reads as accounting.
 */
export interface CatalogPrice {
  provider: ProviderName
  modelId: string
  displayName: string
  /** USD per 1M tokens, as decimal strings — never floats. */
  inputPerMillion: string
  outputPerMillion: string
  cachedInputPerMillion?: string
  /** Recorded on the pricing row, so the ledger keeps its provenance. */
  source: string
  /** Shown in the UI when the rate has a catch. */
  note?: string
}

export const PRICE_CATALOG: CatalogPrice[] = [
  // ── OpenAI ────────────────────────────────────────────────────────────
  {
    provider: "OPENAI",
    modelId: "gpt-5.6-sol",
    displayName: "GPT-5.6 Sol",
    inputPerMillion: "4",
    outputPerMillion: "20",
    cachedInputPerMillion: "0.5",
    source: "OpenAI GPT-5.6 促銷價（2026-08-21 起），查證於 2026-09-15",
    note: "促銷價，至少到 2026-11-21；原價 $5 / $30。促銷結束後要重新設定。",
  },
  {
    provider: "OPENAI",
    modelId: "gpt-5.6-terra",
    displayName: "GPT-5.6 Terra",
    inputPerMillion: "2",
    outputPerMillion: "12",
    source: "OpenAI 2026-07-30 降價後費率，查證於 2026-09-15",
  },
  {
    provider: "OPENAI",
    modelId: "gpt-5.6-luna",
    displayName: "GPT-5.6 Luna",
    inputPerMillion: "0.2",
    outputPerMillion: "1.2",
    source: "OpenAI 2026-07-30 降價後費率，查證於 2026-09-15",
  },

  // ── Anthropic ─────────────────────────────────────────────────────────
  {
    provider: "ANTHROPIC",
    modelId: "claude-fable-5-1",
    displayName: "Claude Fable 5.1",
    inputPerMillion: "10",
    outputPerMillion: "50",
    source: "Anthropic 官方費率表（快取於 2026-06-24）",
  },
  {
    provider: "ANTHROPIC",
    modelId: "claude-opus-5",
    displayName: "Claude Opus 5",
    inputPerMillion: "5",
    outputPerMillion: "25",
    source: "Anthropic 官方費率表（快取於 2026-06-24）",
  },
  {
    provider: "ANTHROPIC",
    modelId: "claude-sonnet-5",
    displayName: "Claude Sonnet 5",
    inputPerMillion: "2",
    outputPerMillion: "10",
    source: "Anthropic 官方費率表（快取於 2026-06-24）",
  },
  {
    provider: "ANTHROPIC",
    modelId: "claude-haiku-4-5",
    displayName: "Claude Haiku 4.5",
    inputPerMillion: "1",
    outputPerMillion: "5",
    source: "Anthropic 官方費率表（快取於 2026-06-24）",
  },

  // ── Google ────────────────────────────────────────────────────────────
  {
    provider: "GOOGLE",
    modelId: "gemini-3.8-flash",
    displayName: "Gemini 3.8 Flash",
    inputPerMillion: "0.75",
    outputPerMillion: "3.75",
    source: "Gemini API 文件 introductory pricing，查證於 2026-09-15",
    note: "導入期優惠價，官方說明至 2026 年底。",
  },

  // ── xAI ───────────────────────────────────────────────────────────────
  {
    provider: "XAI",
    modelId: "grok-4.6",
    displayName: "Grok 4.6",
    inputPerMillion: "2",
    outputPerMillion: "6",
    cachedInputPerMillion: "0.5",
    source: "xAI Grok 4.6 費率（未滿 200K 提示），查證於 2026-09-15",
    note: "提示達 200K token 時整筆改以 $4 / $12 計費，此處只記一般費率。",
  },
]

export function catalogPriceFor(
  provider: string,
  modelId: string
): CatalogPrice | undefined {
  return PRICE_CATALOG.find(
    (p) => p.provider === provider && p.modelId === modelId
  )
}
