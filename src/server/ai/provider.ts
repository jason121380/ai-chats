import type { AIRequest, AIResponse, AIStreamEvent, ProviderName } from "./types"

export interface AIProvider {
  provider: ProviderName

  generate(request: AIRequest): Promise<AIResponse>

  stream?(request: AIRequest): AsyncIterable<AIStreamEvent>
}
