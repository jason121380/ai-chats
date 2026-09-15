import type { AIProvider } from "../provider"
import type { AIRequest, AIResponse, AIStreamEvent, FetchFn } from "../types"
import {
  generateOpenAICompatible,
  streamOpenAICompatible,
} from "./openai-compatible"

export interface XAIProviderOptions {
  apiKey: string
  baseUrl?: string
  fetchFn?: FetchFn
}

export class XAIProvider implements AIProvider {
  readonly provider = "XAI" as const

  private readonly options: XAIProviderOptions

  constructor(options: XAIProviderOptions) {
    this.options = options
  }

  private opts() {
    return {
      baseUrl: this.options.baseUrl ?? "https://api.x.ai/v1",
      apiKey: this.options.apiKey,
      fetchFn: this.options.fetchFn,
      maxTokensParam: "max_tokens" as const,
    }
  }

  async generate(request: AIRequest): Promise<AIResponse> {
    return generateOpenAICompatible(request, this.opts())
  }

  stream(request: AIRequest): AsyncIterable<AIStreamEvent> {
    return streamOpenAICompatible(request, this.opts())
  }
}
