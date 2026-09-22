import { describe, expect, it, vi } from "vitest"

import { OpenAIProvider } from "@/server/ai/providers/openai"
import { AnthropicProvider } from "@/server/ai/providers/anthropic"
import { GeminiProvider } from "@/server/ai/providers/gemini"
import { XAIProvider } from "@/server/ai/providers/xai"
import { OpenRouterProvider } from "@/server/ai/providers/openrouter"
import { ProviderError } from "@/server/ai/types"

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

const request = {
  model: "test-model",
  messages: [{ role: "user" as const, content: "Hello" }],
  systemPrompt: "You are helpful.",
  temperature: 0.4,
  maxOutputTokens: 256,
}

describe("OpenAIProvider", () => {
  it("translates request/response and normalizes usage", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jsonResponse({
        id: "chatcmpl-123",
        model: "test-model",
        choices: [
          { message: { content: "Hi there" }, finish_reason: "stop" },
        ],
        usage: {
          prompt_tokens: 12,
          completion_tokens: 4,
          total_tokens: 16,
          prompt_tokens_details: { cached_tokens: 2 },
        },
      })
    )
    const provider = new OpenAIProvider({ apiKey: "sk-test", fetchFn })
    const res = await provider.generate(request)

    expect(res.content).toBe("Hi there")
    expect(res.providerRequestId).toBe("chatcmpl-123")
    expect(res.finishReason).toBe("stop")
    expect(res.usage.inputTokens).toBe(12)
    expect(res.usage.outputTokens).toBe(4)
    expect(res.usage.totalTokens).toBe(16)
    expect(res.usage.cachedInputTokens).toBe(2)

    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit]
    expect(url).toBe("https://api.openai.com/v1/chat/completions")
    const body = JSON.parse(init.body as string)
    expect(body.model).toBe("test-model")
    expect(body.messages[0]).toEqual({
      role: "system",
      content: "You are helpful.",
    })
    expect(body.max_completion_tokens).toBe(256)
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer sk-test"
    )
  })

  it("maps 429 to a retryable RATE_LIMITED ProviderError", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(new Response("rate limit", { status: 429 }))
    const provider = new OpenAIProvider({ apiKey: "sk-test", fetchFn })
    await expect(provider.generate(request)).rejects.toMatchObject({
      name: "ProviderError",
      code: "RATE_LIMITED",
      retryable: true,
    })
  })

  it("maps 401 to a non-retryable AUTH ProviderError", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(new Response("bad key", { status: 401 }))
    const provider = new OpenAIProvider({ apiKey: "sk-test", fetchFn })
    await expect(provider.generate(request)).rejects.toMatchObject({
      code: "AUTH",
      retryable: false,
    })
  })

  it("wraps network failures as retryable NETWORK errors", async () => {
    const fetchFn = vi.fn().mockRejectedValue(new TypeError("fetch failed"))
    const provider = new OpenAIProvider({ apiKey: "sk-test", fetchFn })
    await expect(provider.generate(request)).rejects.toMatchObject({
      code: "NETWORK",
      retryable: true,
    })
  })

  /**
   * Node reports every transport failure as the same `TypeError: fetch
   * failed`. Three models failing at once wrote that one sentence three
   * times and nobody could tell a DNS outage from a refused connection
   * afterwards, because the reason lives in `cause` and was being dropped.
   */
  it("keeps the reason a request never left the machine", async () => {
    const cause = Object.assign(
      new Error("getaddrinfo ENOTFOUND openrouter.ai"),
      { code: "ENOTFOUND" }
    )
    const fetchFn = vi
      .fn()
      .mockRejectedValue(new TypeError("fetch failed", { cause }))
    const provider = new OpenAIProvider({ apiKey: "sk-test", fetchFn })
    await expect(provider.generate(request)).rejects.toMatchObject({
      code: "NETWORK",
      message:
        "Network error: fetch failed caused by: getaddrinfo ENOTFOUND openrouter.ai (ENOTFOUND)",
    })
  })

  it("reaches through the AggregateError undici wraps several addresses in", async () => {
    const refused = Object.assign(new Error("connect ECONNREFUSED"), {
      code: "ECONNREFUSED",
    })
    const fetchFn = vi.fn().mockRejectedValue(
      new TypeError("fetch failed", {
        cause: new AggregateError([refused], "all addresses failed"),
      })
    )
    const provider = new OpenAIProvider({ apiKey: "sk-test", fetchFn })
    await expect(provider.generate(request)).rejects.toMatchObject({
      message:
        "Network error: fetch failed caused by: all addresses failed caused by: connect ECONNREFUSED (ECONNREFUSED)",
    })
  })

  it("survives a cause that points back at itself", async () => {
    const loop = new Error("round and round") as Error & { cause?: unknown }
    loop.cause = loop
    const fetchFn = vi.fn().mockRejectedValue(loop)
    const provider = new OpenAIProvider({ apiKey: "sk-test", fetchFn })
    await expect(provider.generate(request)).rejects.toMatchObject({
      message: "Network error: round and round",
    })
  })
})

describe("XAIProvider", () => {
  it("targets the xAI base URL and uses max_tokens", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jsonResponse({
        id: "resp-1",
        choices: [{ message: { content: "Grok says hi" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 },
      })
    )
    const provider = new XAIProvider({ apiKey: "xai-test", fetchFn })
    const res = await provider.generate(request)
    expect(res.content).toBe("Grok says hi")

    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit]
    expect(url).toBe("https://api.x.ai/v1/chat/completions")
    const body = JSON.parse(init.body as string)
    expect(body.max_tokens).toBe(256)
  })
})

describe("AnthropicProvider", () => {
  it("translates request/response and normalizes usage", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jsonResponse({
        id: "msg-1",
        model: "test-model",
        content: [{ type: "text", text: "Claude here" }],
        stop_reason: "end_turn",
        usage: {
          input_tokens: 100,
          output_tokens: 40,
          cache_read_input_tokens: 60,
        },
      })
    )
    const provider = new AnthropicProvider({ apiKey: "ak-test", fetchFn })
    const res = await provider.generate(request)

    expect(res.content).toBe("Claude here")
    expect(res.finishReason).toBe("end_turn")
    expect(res.usage.inputTokens).toBe(160)
    expect(res.usage.cachedInputTokens).toBe(60)
    expect(res.usage.outputTokens).toBe(40)

    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit]
    expect(url).toBe("https://api.anthropic.com/v1/messages")
    const headers = init.headers as Record<string, string>
    expect(headers["x-api-key"]).toBe("ak-test")
    expect(headers["anthropic-version"]).toBe("2023-06-01")
    const body = JSON.parse(init.body as string)
    expect(body.system).toBe("You are helpful.")
    expect(body.max_tokens).toBe(256)
    // System prompt must not appear in the messages array
    expect(
      (body.messages as Array<{ role: string }>).every(
        (m) => m.role !== "system"
      )
    ).toBe(true)
  })

  it("maps provider 500 to retryable SERVER_ERROR", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(new Response("boom", { status: 500 }))
    const provider = new AnthropicProvider({ apiKey: "ak-test", fetchFn })
    await expect(provider.generate(request)).rejects.toMatchObject({
      code: "SERVER_ERROR",
      retryable: true,
    })
  })
})

describe("GeminiProvider", () => {
  it("translates request/response and normalizes usage", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jsonResponse({
        responseId: "gem-1",
        modelVersion: "test-model",
        candidates: [
          {
            content: { parts: [{ text: "Gemini " }, { text: "reply" }] },
            finishReason: "STOP",
          },
        ],
        usageMetadata: {
          promptTokenCount: 20,
          candidatesTokenCount: 10,
          thoughtsTokenCount: 5,
          totalTokenCount: 35,
        },
      })
    )
    const provider = new GeminiProvider({ apiKey: "g-test", fetchFn })
    const res = await provider.generate(request)

    expect(res.content).toBe("Gemini reply")
    expect(res.usage.inputTokens).toBe(20)
    expect(res.usage.outputTokens).toBe(15)
    expect(res.usage.reasoningTokens).toBe(5)
    expect(res.providerRequestId).toBe("gem-1")

    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/test-model:generateContent"
    )
    const headers = init.headers as Record<string, string>
    expect(headers["x-goog-api-key"]).toBe("g-test")
    const body = JSON.parse(init.body as string)
    expect(body.systemInstruction.parts[0].text).toBe("You are helpful.")
    expect(body.generationConfig.maxOutputTokens).toBe(256)
    expect(body.contents[0].role).toBe("user")
  })

  it("throws when no candidates are returned", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ candidates: [] }))
    const provider = new GeminiProvider({ apiKey: "g-test", fetchFn })
    await expect(provider.generate(request)).rejects.toBeInstanceOf(
      ProviderError
    )
  })
})

describe("OpenRouterProvider", () => {
  it("targets OpenRouter with attribution, and keeps its cost and upstream vendor", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jsonResponse({
        id: "gen-abc",
        model: "anthropic/claude-sonnet-4.5",
        provider: "Anthropic",
        choices: [{ message: { content: "Via OpenRouter" }, finish_reason: "stop" }],
        usage: {
          prompt_tokens: 194,
          completion_tokens: 2,
          total_tokens: 196,
          cost: 0.00095,
          cost_details: { upstream_inference_cost: 0.0009 },
          prompt_tokens_details: { cached_tokens: 50, cache_write_tokens: 100 },
          completion_tokens_details: { reasoning_tokens: 0 },
        },
      })
    )
    const provider = new OpenRouterProvider({ apiKey: "or-test", fetchFn })
    const res = await provider.generate(request)

    expect(res.content).toBe("Via OpenRouter")
    expect(res.providerRequestId).toBe("gen-abc")
    expect(res.usage.inputTokens).toBe(194)
    expect(res.usage.outputTokens).toBe(2)
    expect(res.usage.cachedInputTokens).toBe(50)
    // What OpenRouter actually charged is kept verbatim for reconciliation;
    // the ledger's own cost is still tokens × the snapshotted price.
    expect((res.usage.rawUsage as { cost: number }).cost).toBe(0.00095)
    // Which upstream served the slug that day is part of the audit trail.
    expect(res.metadata).toEqual({
      model: "anthropic/claude-sonnet-4.5",
      upstreamProvider: "Anthropic",
    })

    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit]
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions")
    const headers = init.headers as Record<string, string>
    expect(headers.Authorization).toBe("Bearer or-test")
    expect(headers["X-OpenRouter-Title"]).toBe("AI Council")
    const body = JSON.parse(init.body as string)
    expect(body.max_tokens).toBe(256)
    // Usage is always attached by OpenRouter; nothing is requested for it.
    expect(body.usage).toBeUndefined()
  })

  it("caps output when 設定 sets no limit, so OpenRouter reserves for an answer, not a ceiling", async () => {
    // Without max_tokens OpenRouter reserves credit for the model's whole
    // output ceiling and refuses with 402 when the balance cannot cover
    // it — "requested up to 65536 tokens, but can only afford 800".
    const fetchFn = vi.fn().mockResolvedValue(
      jsonResponse({
        id: "gen-1",
        choices: [{ message: { content: "ok" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      })
    )
    const provider = new OpenRouterProvider({ apiKey: "or-test", fetchFn })
    const { maxOutputTokens: _unset, ...uncapped } = request
    await provider.generate(uncapped)
    const [, init] = fetchFn.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(init.body as string).max_tokens).toBe(8192)
  })

  it("treats an error payload inside a 200 as the failure it is", async () => {
    // OpenRouter has already sent the status line when an upstream fails, so
    // the failure comes back as a body. Reading it as "no choices" would be
    // wrong, and reading it as success would bill half an answer.
    const fetchFn = vi.fn().mockResolvedValue(
      jsonResponse({
        error: { code: 429, message: "Provider rate limited" },
      })
    )
    const provider = new OpenRouterProvider({ apiKey: "or-test", fetchFn })
    await expect(provider.generate(request)).rejects.toMatchObject({
      name: "ProviderError",
      code: "RATE_LIMITED",
      retryable: true,
      httpStatus: 429,
    })
  })

  it("does not retry an in-body error with no usable code", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jsonResponse({ error: { message: "Moderation flagged the input" } })
    )
    const provider = new OpenRouterProvider({ apiKey: "or-test", fetchFn })
    await expect(provider.generate(request)).rejects.toMatchObject({
      code: "UNKNOWN",
      retryable: false,
    })
  })

  it("maps 402 (out of credits) to a non-retryable request error", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(new Response("Insufficient credits", { status: 402 }))
    const provider = new OpenRouterProvider({ apiKey: "or-test", fetchFn })
    await expect(provider.generate(request)).rejects.toMatchObject({
      code: "INVALID_REQUEST",
      retryable: false,
      httpStatus: 402,
    })
  })
})
