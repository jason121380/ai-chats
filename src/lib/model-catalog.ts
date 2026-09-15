import type { ProviderName } from "@prisma/client"

/**
 * Suggestions for the 設定 model picker — the current generation from each
 * provider, verified against their own documentation on 2026-09-15.
 *
 * This list WILL go stale; providers ship models faster than this file gets
 * edited, and a stale list is exactly how gemini-2.5-pro ended up 404ing in
 * production. So it is a shortcut, never a gate: the picker always accepts a
 * model ID typed by hand, and nothing here restricts what the API will
 * accept. Treat a missing model as "not listed yet", not "unsupported".
 *
 * `note` is what an operator needs to choose between two rows — the tier and
 * the tradeoff. Benchmarks and prices are deliberately absent: they move
 * faster than this file and would be wrong sooner than the IDs.
 */
export interface CatalogModel {
  provider: ProviderName
  /** The exact API model ID. This string is sent to the provider verbatim. */
  modelId: string
  displayName: string
  /** Release date as published by the provider, YYYY-MM. */
  released: string
  note: string
}

export const MODEL_CATALOG: CatalogModel[] = [
  // ── OpenAI — the GPT-5.6 family (Sol / Terra / Luna tiers) ────────────
  {
    provider: "OPENAI",
    modelId: "gpt-5.6-sol",
    displayName: "GPT-5.6 Sol",
    released: "2026-07",
    note: "旗艦，最高能力（gpt-5.6 是它的別名）",
  },
  {
    provider: "OPENAI",
    modelId: "gpt-5.6-terra",
    displayName: "GPT-5.6 Terra",
    released: "2026-07",
    note: "平衡，能力與成本折衷",
  },
  {
    provider: "OPENAI",
    modelId: "gpt-5.6-luna",
    displayName: "GPT-5.6 Luna",
    released: "2026-07",
    note: "最快最省，適合高流量與即時互動",
  },

  // ── Anthropic ─────────────────────────────────────────────────────────
  {
    provider: "ANTHROPIC",
    modelId: "claude-fable-5-1",
    displayName: "Claude Fable 5.1",
    released: "2026",
    note: "最高能力，長時程推理與代理任務",
  },
  {
    provider: "ANTHROPIC",
    modelId: "claude-opus-5",
    displayName: "Claude Opus 5",
    released: "2026",
    note: "旗艦，複雜推理的預設選擇",
  },
  {
    provider: "ANTHROPIC",
    modelId: "claude-sonnet-5",
    displayName: "Claude Sonnet 5",
    released: "2026",
    note: "中階，日常任務的性價比選擇",
  },
  {
    provider: "ANTHROPIC",
    modelId: "claude-haiku-4-5",
    displayName: "Claude Haiku 4.5",
    released: "2025-10",
    note: "最輕量，分類與高流量用途",
  },

  // ── Google Gemini ─────────────────────────────────────────────────────
  {
    provider: "GOOGLE",
    modelId: "gemini-3.8-flash",
    displayName: "Gemini 3.8 Flash",
    released: "2026",
    note: "最新 Flash，1M 上下文，正式版",
  },
  {
    provider: "GOOGLE",
    modelId: "gemini-3.7-flash",
    displayName: "Gemini 3.7 Flash",
    released: "2026",
    note: "前一代 Flash",
  },
  {
    provider: "GOOGLE",
    modelId: "gemini-3.5-flash",
    displayName: "Gemini 3.5 Flash",
    released: "2026-05",
    note: "Flash 世代，代理工作流表現接近 Pro",
  },
  {
    provider: "GOOGLE",
    modelId: "gemini-3.1-pro-preview",
    displayName: "Gemini 3.1 Pro (preview)",
    released: "2026-03",
    note: "Pro 級推理；preview 版本，介面可能變動",
  },
  {
    provider: "GOOGLE",
    modelId: "gemini-3.1-flash-lite",
    displayName: "Gemini 3.1 Flash-Lite",
    released: "2026",
    note: "最省，高流量批次用途",
  },

  // ── xAI ───────────────────────────────────────────────────────────────
  {
    provider: "XAI",
    modelId: "grok-4.6",
    displayName: "Grok 4.6",
    released: "2026-08",
    note: "旗艦，500K 上下文，偏程式與代理任務",
  },
  {
    provider: "XAI",
    modelId: "grok-4.5",
    displayName: "Grok 4.5",
    released: "2026-07",
    note: "前一代旗艦，500K 上下文",
  },
  {
    provider: "XAI",
    modelId: "grok-4.3",
    displayName: "Grok 4.3",
    released: "2026-04",
    note: "1M 上下文，已停用舊型號的接手對象",
  },
]

export function catalogFor(provider: ProviderName): CatalogModel[] {
  return MODEL_CATALOG.filter((m) => m.provider === provider)
}
