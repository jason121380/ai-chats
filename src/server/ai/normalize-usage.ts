import type { NormalizedUsage } from "./types"

/**
 * Usage normalization. Each provider reports token usage in its own shape;
 * adapters call these helpers so the rest of the system only ever sees
 * NormalizedUsage.
 *
 * Contract:
 * - Provider-reported numbers only. Anything not reported is null — we never
 *   estimate with a tokenizer and pretend it is billing-grade.
 * - cachedInputTokens is a subset of inputTokens.
 * - reasoningTokens is a subset of outputTokens.
 * - rawUsage always keeps the untouched provider payload for future re-analysis.
 */

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

export function emptyUsage(rawUsage: unknown = null): NormalizedUsage {
  return {
    inputTokens: null,
    outputTokens: null,
    totalTokens: null,
    cachedInputTokens: null,
    reasoningTokens: null,
    rawUsage,
  }
}

/**
 * OpenAI Chat Completions / Responses usage shape (also used by xAI, which is
 * OpenAI-compatible):
 * {
 *   prompt_tokens, completion_tokens, total_tokens,
 *   prompt_tokens_details: { cached_tokens },
 *   completion_tokens_details: { reasoning_tokens }
 * }
 */
export function normalizeOpenAIUsage(raw: unknown): NormalizedUsage {
  if (!raw || typeof raw !== "object") return emptyUsage(raw ?? null)
  const u = raw as Record<string, unknown>
  const promptDetails = (u.prompt_tokens_details ?? {}) as Record<
    string,
    unknown
  >
  const completionDetails = (u.completion_tokens_details ?? {}) as Record<
    string,
    unknown
  >

  const inputTokens = num(u.prompt_tokens) ?? num(u.input_tokens)
  const outputTokens = num(u.completion_tokens) ?? num(u.output_tokens)
  const totalTokens =
    num(u.total_tokens) ??
    (inputTokens !== null && outputTokens !== null
      ? inputTokens + outputTokens
      : null)

  return {
    inputTokens,
    outputTokens,
    totalTokens,
    cachedInputTokens: num(promptDetails.cached_tokens),
    reasoningTokens: num(completionDetails.reasoning_tokens),
    rawUsage: raw,
  }
}

/**
 * Anthropic Messages usage shape:
 * { input_tokens, output_tokens, cache_read_input_tokens, cache_creation_input_tokens }
 *
 * Anthropic's input_tokens EXCLUDES cache reads/creation, so to honor the
 * "cached ⊆ input" contract we fold cache reads into inputTokens and expose
 * them as cachedInputTokens. Cache-creation tokens are also folded into
 * inputTokens (billed at the input rate unless a cached price covers reads
 * only); the raw payload keeps the exact split.
 */
export function normalizeAnthropicUsage(raw: unknown): NormalizedUsage {
  if (!raw || typeof raw !== "object") return emptyUsage(raw ?? null)
  const u = raw as Record<string, unknown>

  const base = num(u.input_tokens)
  const cacheRead = num(u.cache_read_input_tokens) ?? 0
  const cacheCreation = num(u.cache_creation_input_tokens) ?? 0
  const outputTokens = num(u.output_tokens)

  const inputTokens = base !== null ? base + cacheRead + cacheCreation : null
  const totalTokens =
    inputTokens !== null && outputTokens !== null
      ? inputTokens + outputTokens
      : null

  return {
    inputTokens,
    outputTokens,
    totalTokens,
    cachedInputTokens: cacheRead > 0 ? cacheRead : num(u.cache_read_input_tokens),
    reasoningTokens: null,
    rawUsage: raw,
  }
}

/**
 * Google Gemini usageMetadata shape:
 * { promptTokenCount, candidatesTokenCount, totalTokenCount,
 *   cachedContentTokenCount, thoughtsTokenCount }
 *
 * Gemini's candidatesTokenCount excludes thoughts; totalTokenCount includes
 * them. We fold thoughtsTokenCount into outputTokens and expose it as
 * reasoningTokens so the subset contract holds.
 */
export function normalizeGeminiUsage(raw: unknown): NormalizedUsage {
  if (!raw || typeof raw !== "object") return emptyUsage(raw ?? null)
  const u = raw as Record<string, unknown>

  const inputTokens = num(u.promptTokenCount)
  const candidates = num(u.candidatesTokenCount)
  const thoughts = num(u.thoughtsTokenCount)
  const outputTokens =
    candidates !== null ? candidates + (thoughts ?? 0) : thoughts

  const totalTokens =
    num(u.totalTokenCount) ??
    (inputTokens !== null && outputTokens !== null
      ? inputTokens + outputTokens
      : null)

  return {
    inputTokens,
    outputTokens,
    totalTokens,
    cachedInputTokens: num(u.cachedContentTokenCount),
    reasoningTokens: thoughts,
    rawUsage: raw,
  }
}
