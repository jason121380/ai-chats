import { describe, expect, it, vi } from "vitest"

import { OpenAIProvider } from "@/server/ai/providers/openai"
import { AnthropicProvider } from "@/server/ai/providers/anthropic"
import { GeminiProvider } from "@/server/ai/providers/gemini"
import { XAIProvider } from "@/server/ai/providers/xai"
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
