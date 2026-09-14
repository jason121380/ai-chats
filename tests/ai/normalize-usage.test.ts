import { describe, expect, it } from "vitest"

import {
  normalizeAnthropicUsage,
  normalizeGeminiUsage,
  normalizeOpenAIUsage,
} from "@/server/ai/normalize-usage"

describe("normalizeOpenAIUsage", () => {
  it("normalizes a full OpenAI usage payload", () => {
    const raw = {
      prompt_tokens: 1200,
      completion_tokens: 800,
      total_tokens: 2000,
      prompt_tokens_details: { cached_tokens: 300 },
      completion_tokens_details: { reasoning_tokens: 150 },
    }
    const usage = normalizeOpenAIUsage(raw)
    expect(usage.inputTokens).toBe(1200)
    expect(usage.outputTokens).toBe(800)
    expect(usage.totalTokens).toBe(2000)
    expect(usage.cachedInputTokens).toBe(300)
    expect(usage.reasoningTokens).toBe(150)
    expect(usage.rawUsage).toEqual(raw)
  })

  it("returns nulls when usage is absent — never guesses", () => {
    const usage = normalizeOpenAIUsage(null)
    expect(usage.inputTokens).toBeNull()
    expect(usage.outputTokens).toBeNull()
    expect(usage.totalTokens).toBeNull()
    expect(usage.cachedInputTokens).toBeNull()
    expect(usage.reasoningTokens).toBeNull()
  })

  it("computes totalTokens when the provider omits it", () => {
    const usage = normalizeOpenAIUsage({
      prompt_tokens: 10,
      completion_tokens: 5,
    })
    expect(usage.totalTokens).toBe(15)
  })
})

describe("normalizeAnthropicUsage", () => {
  it("folds cache reads into inputTokens (cached ⊆ input contract)", () => {
    const raw = {
      input_tokens: 1000,
      output_tokens: 400,
      cache_read_input_tokens: 600,
      cache_creation_input_tokens: 200,
    }
    const usage = normalizeAnthropicUsage(raw)
    expect(usage.inputTokens).toBe(1800)
    expect(usage.cachedInputTokens).toBe(600)
    expect(usage.outputTokens).toBe(400)
    expect(usage.totalTokens).toBe(2200)
    expect(usage.reasoningTokens).toBeNull()
    expect(usage.rawUsage).toEqual(raw)
  })

  it("handles a payload without cache fields", () => {
    const usage = normalizeAnthropicUsage({
      input_tokens: 50,
      output_tokens: 20,
    })
    expect(usage.inputTokens).toBe(50)
    expect(usage.outputTokens).toBe(20)
    expect(usage.totalTokens).toBe(70)
  })
})

describe("normalizeGeminiUsage", () => {
  it("folds thoughts into outputTokens (reasoning ⊆ output contract)", () => {
    const raw = {
      promptTokenCount: 500,
      candidatesTokenCount: 300,
      thoughtsTokenCount: 120,
      totalTokenCount: 920,
      cachedContentTokenCount: 100,
    }
    const usage = normalizeGeminiUsage(raw)
    expect(usage.inputTokens).toBe(500)
    expect(usage.outputTokens).toBe(420)
    expect(usage.reasoningTokens).toBe(120)
    expect(usage.cachedInputTokens).toBe(100)
    expect(usage.totalTokens).toBe(920)
  })

  it("handles a payload without thoughts", () => {
    const usage = normalizeGeminiUsage({
      promptTokenCount: 10,
      candidatesTokenCount: 4,
      totalTokenCount: 14,
    })
    expect(usage.inputTokens).toBe(10)
    expect(usage.outputTokens).toBe(4)
    expect(usage.reasoningTokens).toBeNull()
  })
})
