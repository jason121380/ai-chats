import type { AIProvider } from "../provider"
import type { AIRequest, AIResponse, AIStreamEvent, FetchFn } from "../types"
import {
  generateOpenAICompatible,
  streamOpenAICompatible,
} from "./openai-compatible"

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

  private opts() {
    return {
      baseUrl: this.options.baseUrl ?? "https://api.openai.com/v1",
      apiKey: this.options.apiKey,
      fetchFn: this.options.fetchFn,
      maxTokensParam: "max_completion_tokens" as const,
    }
  }

  async generate(request: AIRequest): Promise<AIResponse> {
    return generateOpenAICompatible(request, this.opts())
  }

  stream(request: AIRequest): AsyncIterable<AIStreamEvent> {
    return streamOpenAICompatible(request, this.opts())
  }
}
