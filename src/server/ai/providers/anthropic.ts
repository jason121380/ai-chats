import type { AIProvider } from "../provider"
import type {
  AIRequest,
  AIResponse,
  AIStreamEvent,
  FetchFn,
} from "../types"
import { networkError, ProviderError, providerErrorFromHttp } from "../types"
import { normalizeAnthropicUsage } from "../normalize-usage"
import { parseSseJson, readSseData } from "./sse"

export interface AnthropicProviderOptions {
  apiKey: string
  baseUrl?: string
  fetchFn?: FetchFn
}

const DEFAULT_MAX_OUTPUT_TOKENS = 4096

export class AnthropicProvider implements AIProvider {
  readonly provider = "ANTHROPIC" as const

  private readonly options: AnthropicProviderOptions

  constructor(options: AnthropicProviderOptions) {
    this.options = options
  }

  async generate(request: AIRequest): Promise<AIResponse> {
    const fetchFn = this.options.fetchFn ?? fetch
    const baseUrl = this.options.baseUrl ?? "https://api.anthropic.com"

    const body: Record<string, unknown> = {
      model: request.model,
      // Anthropic requires max_tokens.
      max_tokens: request.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
      messages: request.messages
        .filter((m) => m.role !== "system")
        .map((m) => ({ role: m.role, content: m.content })),
    }
    if (request.systemPrompt) body.system = request.systemPrompt
    if (request.temperature !== undefined) body.temperature = request.temperature

    let res: Response
    try {
      res = await fetchFn(`${baseUrl}/v1/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.options.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(body),
        signal: request.signal ?? null,
      })
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") throw err
      throw networkError(err)
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "")
      throw providerErrorFromHttp(res.status, text)
    }

    const json = (await res.json()) as {
      id?: string
      content?: Array<{ type: string; text?: string }>
      stop_reason?: string
      usage?: unknown
      model?: string
    }

    const content = (json.content ?? [])
      .filter((block) => block.type === "text" && typeof block.text === "string")
      .map((block) => block.text)
      .join("")

    return {
      content,
      usage: normalizeAnthropicUsage(json.usage ?? null),
      providerRequestId: json.id,
      finishReason: json.stop_reason ?? undefined,
      metadata: { model: json.model },
    }
  }

  /**
   * The same call with `stream: true`.
   *
   * Anthropic splits usage across two events: `message_start` carries the
   * input tokens and `message_delta` the output tokens, so both are merged
   * before the final usage is normalized. Reading only one of them would
   * halve every streamed turn's recorded cost.
   */
  async *stream(request: AIRequest): AsyncGenerator<AIStreamEvent> {
    const fetchFn = this.options.fetchFn ?? fetch
    const baseUrl = this.options.baseUrl ?? "https://api.anthropic.com"

    const body: Record<string, unknown> = {
      model: request.model,
      max_tokens: request.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
      messages: request.messages
        .filter((m) => m.role !== "system")
        .map((m) => ({ role: m.role, content: m.content })),
      stream: true,
    }
    if (request.systemPrompt) body.system = request.systemPrompt
    if (request.temperature !== undefined) body.temperature = request.temperature

    let res: Response
    try {
      res = await fetchFn(`${baseUrl}/v1/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.options.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(body),
        signal: request.signal ?? null,
      })
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") throw err
      throw networkError(err)
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "")
      throw providerErrorFromHttp(res.status, text)
    }
    if (!res.body) {
      throw new ProviderError("Provider returned no stream body", {
        code: "UNKNOWN",
        retryable: false,
      })
    }

    let content = ""
    let requestId: string | undefined
    let model: string | undefined
    let stopReason: string | undefined
    let usage: Record<string, unknown> = {}

    for await (const payload of readSseData(res.body)) {
      const event = parseSseJson<{
        type?: string
        message?: { id?: string; model?: string; usage?: Record<string, unknown> }
        delta?: { text?: string; stop_reason?: string }
        usage?: Record<string, unknown>
      }>(payload)
      if (!event) continue

      if (event.type === "message_start" && event.message) {
        requestId = event.message.id
        model = event.message.model
        if (event.message.usage) usage = { ...usage, ...event.message.usage }
      } else if (event.type === "content_block_delta" && event.delta?.text) {
        content += event.delta.text
        yield { type: "delta", delta: event.delta.text }
      } else if (event.type === "message_delta") {
        if (event.delta?.stop_reason) stopReason = event.delta.stop_reason
        if (event.usage) usage = { ...usage, ...event.usage }
      }
    }

    yield {
      type: "done",
      response: {
        content,
        usage: normalizeAnthropicUsage(
          Object.keys(usage).length > 0 ? usage : null
        ),
        providerRequestId: requestId,
        finishReason: stopReason,
        metadata: { model },
      },
    }
  }
}
