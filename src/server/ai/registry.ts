import type { AIProvider } from "./provider"
import type { ProviderName } from "./types"
import { getEnv } from "@/lib/env"
import { OpenAIProvider } from "./providers/openai"
import { AnthropicProvider } from "./providers/anthropic"
import { GeminiProvider } from "./providers/gemini"
import { XAIProvider } from "./providers/xai"
import { OpenRouterProvider } from "./providers/openrouter"

/**
 * ProviderRegistry — maps a ProviderName to its adapter.
 * Adding a future provider (e.g. MUSE) means implementing AIProvider and
 * registering it here. The Council Engine never changes.
 */
export class ProviderRegistry {
  private readonly providers = new Map<ProviderName, AIProvider>()

  register(provider: AIProvider): void {
    this.providers.set(provider.provider, provider)
  }

  get(name: ProviderName): AIProvider {
    const provider = this.providers.get(name)
    if (!provider) {
      throw new Error(
        `Provider ${name} is not configured. Check its API key in the environment.`
      )
    }
    return provider
  }

  has(name: ProviderName): boolean {
    return this.providers.has(name)
  }

  configuredProviders(): ProviderName[] {
    return Array.from(this.providers.keys())
  }
}

let defaultRegistry: ProviderRegistry | null = null

/** Registry built from environment API keys. Providers without keys are absent. */
export function getProviderRegistry(): ProviderRegistry {
  if (defaultRegistry) return defaultRegistry
  const env = getEnv()
  const registry = new ProviderRegistry()

  if (env.OPENAI_API_KEY) {
    registry.register(new OpenAIProvider({ apiKey: env.OPENAI_API_KEY }))
  }
  if (env.ANTHROPIC_API_KEY) {
    registry.register(new AnthropicProvider({ apiKey: env.ANTHROPIC_API_KEY }))
  }
  if (env.GOOGLE_AI_API_KEY) {
    registry.register(new GeminiProvider({ apiKey: env.GOOGLE_AI_API_KEY }))
  }
  if (env.XAI_API_KEY) {
    registry.register(new XAIProvider({ apiKey: env.XAI_API_KEY }))
  }
  if (env.OPENROUTER_API_KEY) {
    registry.register(
      new OpenRouterProvider({ apiKey: env.OPENROUTER_API_KEY })
    )
  }

  defaultRegistry = registry
  return registry
}

/** Test helper. */
export function resetProviderRegistry(): void {
  defaultRegistry = null
}
