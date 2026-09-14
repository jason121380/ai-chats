import type { AIProvider } from "../provider"
import type { AIRequest, AIResponse, FetchFn } from "../types"
import { ProviderError, providerErrorFromHttp } from "../types"
import { normalizeAnthropicUsage } from "../normalize-usage"

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
      throw new ProviderError(`Network error: ${String(err)}`, {
        code: "NETWORK",
        cause: err,
      })
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
}
