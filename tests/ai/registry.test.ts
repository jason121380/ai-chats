import { afterEach, describe, expect, it } from "vitest"

import { resetEnvCache } from "@/lib/env"
import {
  getProviderRegistry,
  resetProviderRegistry,
} from "@/server/ai/registry"

/**
 * A provider exists exactly when its key does. That is what lets 設定 say
 * "API key missing" per model and what keeps a missing key from blocking
 * anything else — including the new gateway.
 */
describe("the provider registry", () => {
  const saved = process.env.OPENROUTER_API_KEY

  afterEach(() => {
    if (saved === undefined) delete process.env.OPENROUTER_API_KEY
    else process.env.OPENROUTER_API_KEY = saved
    resetEnvCache()
    resetProviderRegistry()
  })

  it("registers OpenRouter when its key is set", () => {
    process.env.OPENROUTER_API_KEY = "or-test"
    resetEnvCache()
    resetProviderRegistry()
    const registry = getProviderRegistry()
    expect(registry.has("OPENROUTER")).toBe(true)
    expect(registry.get("OPENROUTER").provider).toBe("OPENROUTER")
  })

  it("leaves OpenRouter absent without a key", () => {
    delete process.env.OPENROUTER_API_KEY
    resetEnvCache()
    resetProviderRegistry()
    expect(getProviderRegistry().has("OPENROUTER")).toBe(false)
  })
})
