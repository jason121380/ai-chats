import type { AIProvider } from "../provider"
import type { AIRequest, AIResponse, FetchFn } from "../types"
import { generateOpenAICompatible } from "./openai-compatible"

export interface OpenAIProviderOptions {
  apiKey: string
  baseUrl?: string
  fetchFn?: FetchFn
}

export class OpenAIProvider implements AIProvider {
  readonly provider = "OPENAI" as const

  private readonly options: Required<Pick<OpenAIProviderOptions, "apiKey">> &
    OpenAIProviderOptions

  constructor(options: OpenAIProviderOptions) {
    this.options = options
  }

  async generate(request: AIRequest): Promise<AIResponse> {
    return generateOpenAICompatible(request, {
      baseUrl: this.options.baseUrl ?? "https://api.openai.com/v1",
      apiKey: this.options.apiKey,
      fetchFn: this.options.fetchFn,
      maxTokensParam: "max_completion_tokens",
    })
  }
}
