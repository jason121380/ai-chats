import { afterEach, describe, expect, it, vi } from "vitest"

import {
  getOpenRouterCatalog,
  mapCatalogModel,
  resetOpenRouterCatalogCache,
} from "@/server/openrouter/catalog"

/**
 * OpenRouter's catalog replaces a hand-typed list, and its prices go straight
 * into the pricing table. Two things make that safe rather than convenient:
 * the per-token → per-million conversion must be exact, because it becomes a
 * ledger snapshot; and a rate that is not a real price (negative, missing,
 * zero-as-"no separate rate") must not become one either.
 */

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

afterEach(() => {
  resetOpenRouterCatalogCache()
})

describe("mapCatalogModel", () => {
  it("converts USD-per-token strings to exact per-million figures", () => {
    const m = mapCatalogModel({
      id: "anthropic/claude-sonnet-4.5",
      name: "Anthropic: Claude Sonnet 4.5",
      context_length: 200000,
      pricing: {
        prompt: "0.000003",
        completion: "0.000015",
        input_cache_read: "0.0000003",
        internal_reasoning: "0",
      },
    })
    expect(m).toEqual({
      modelId: "anthropic/claude-sonnet-4.5",
      displayName: "Anthropic: Claude Sonnet 4.5",
      contextLength: 200000,
      pricing: {
        inputPerMillion: "3",
        outputPerMillion: "15",
        cachedInputPerMillion: "0.3",
        // Zero is "no separate rate", so the cost engine bills reasoning
        // tokens at the output rate — which is what the vendor does.
        reasoningPerMillion: null,
      },
    })
  })

  it("keeps sub-cent rates exact and free of exponent notation", () => {
    const m = mapCatalogModel({
      id: "google/gemini-flash-lite",
      pricing: { prompt: "0.0000000375", completion: "0.00000015" },
    })
    // The pricing route accepts plain decimals only; "3.75e-2" would be
    // rejected and the model would silently record MISSING.
    expect(m?.pricing).toEqual({
      inputPerMillion: "0.0375",
      outputPerMillion: "0.15",
      cachedInputPerMillion: null,
      reasoningPerMillion: null,
    })
  })

  it("carries a free model as a zero price, not a missing one", () => {
    const m = mapCatalogModel({
      id: "meta-llama/llama-3-8b:free",
      pricing: { prompt: "0", completion: "0" },
    })
    expect(m?.pricing?.inputPerMillion).toBe("0")
    expect(m?.pricing?.outputPerMillion).toBe("0")
  })

  it("refuses a negative or unparseable rate rather than inventing a price", () => {
    expect(
      mapCatalogModel({
        id: "openrouter/auto",
        pricing: { prompt: "-1", completion: "-1" },
      })?.pricing
    ).toBeNull()
    expect(
      mapCatalogModel({
        id: "x/y",
        pricing: { prompt: "n/a", completion: "0.00001" },
      })?.pricing
    ).toBeNull()
  })

  it("falls back to the ID as the display name and drops rows without an ID", () => {
    expect(mapCatalogModel({ id: "x/y" })?.displayName).toBe("x/y")
    expect(mapCatalogModel({ name: "no id" })).toBeNull()
  })
})

describe("getOpenRouterCatalog", () => {
  it("fetches once and serves the cached list within the TTL", async () => {
    // A fresh Response per call: a body can only be read once, and the
    // point of this test is that the second call never reads one.
    const fetchFn = vi.fn().mockImplementation(async () =>
      jsonResponse({
        data: [
          { id: "b/two", pricing: { prompt: "0.000001", completion: "0.000002" } },
          { id: "a/one", pricing: { prompt: "0.000001", completion: "0.000002" } },
        ],
      })
    )
    let clock = 1_000_000
    const now = () => clock

    const first = await getOpenRouterCatalog({ fetchFn, apiKey: "or-key", now })
    expect(first.models.map((m) => m.modelId)).toEqual(["a/one", "b/two"])

    const [, init] = fetchFn.mock.calls[0] as [string, RequestInit]
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer or-key"
    )

    clock += 60_000
    const second = await getOpenRouterCatalog({ fetchFn, now })
    expect(second).toBe(first)
    expect(fetchFn).toHaveBeenCalledTimes(1)

    clock += 11 * 60_000
    await getOpenRouterCatalog({ fetchFn, now })
    expect(fetchFn).toHaveBeenCalledTimes(2)
  })

  it("surfaces an upstream failure instead of an empty catalog", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(new Response("down", { status: 503 }))
    await expect(getOpenRouterCatalog({ fetchFn })).rejects.toThrow("503")
  })
})
