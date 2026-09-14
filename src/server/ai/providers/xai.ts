import type { AIProvider } from "../provider"
import type { AIRequest, AIResponse, FetchFn } from "../types"
import { generateOpenAICompatible } from "./openai-compatible"

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

  async generate(request: AIRequest): Promise<AIResponse> {
    return generateOpenAICompatible(request, {
      baseUrl: this.options.baseUrl ?? "https://api.x.ai/v1",
      apiKey: this.options.apiKey,
      fetchFn: this.options.fetchFn,
      maxTokensParam: "max_tokens",
    })
  }
}
