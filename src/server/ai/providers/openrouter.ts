import type { AIProvider } from "../provider"
import type { AIRequest, AIResponse, AIStreamEvent, FetchFn } from "../types"
import {
  generateOpenAICompatible,
  streamOpenAICompatible,
} from "./openai-compatible"

export interface OpenRouterProviderOptions {
  apiKey: string
  baseUrl?: string
  fetchFn?: FetchFn
}

/**
 * OpenRouter — one adapter, every vendor it carries.
 *
 * The API is OpenAI's chat-completions shape, so the shared implementation
 * does the work. What differs is what the ledger gets back:
 *
 * - `model` is an OpenRouter slug (`anthropic/claude-sonnet-4.5`), and the
 *   response's `provider` names the upstream that actually served it; the
 *   shared code records that as `upstreamProvider` in the metadata.
 * - Usage is always attached, counted with the model's native tokenizer, and
 *   carries `cost`: the amount OpenRouter actually charged. It stays in
 *   `rawUsage`; the ledger's cost is still tokens × the snapshotted price, so
 *   a gap between the two later reads as "the price row is stale", not as a
 *   tokenizer error.
 * - A failure after the request was forwarded upstream arrives inside a 200
 *   as an `error` payload. The shared code turns that into a ProviderError.
 *
 * `X-OpenRouter-Title` is optional attribution for OpenRouter's rankings.
 */
export class OpenRouterProvider implements AIProvider {
  readonly provider = "OPENROUTER" as const

  private readonly options: OpenRouterProviderOptions

  constructor(options: OpenRouterProviderOptions) {
    this.options = options
  }

  private opts() {
    return {
      baseUrl: this.options.baseUrl ?? "https://openrouter.ai/api/v1",
      apiKey: this.options.apiKey,
      fetchFn: this.options.fetchFn,
      maxTokensParam: "max_tokens" as const,
      extraHeaders: { "X-OpenRouter-Title": "AI Council" },
    }
  }

  async generate(request: AIRequest): Promise<AIResponse> {
    return generateOpenAICompatible(request, this.opts())
  }

  stream(request: AIRequest): AsyncIterable<AIStreamEvent> {
    return streamOpenAICompatible(request, this.opts())
  }
}
