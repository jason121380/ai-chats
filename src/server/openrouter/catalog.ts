import Decimal from "decimal.js"

import type { FetchFn } from "@/server/ai/types"
import type { OpenRouterCatalogModelDto } from "@/types/api"

/**
 * OpenRouter's live model list, shaped for the 設定 picker.
 *
 * This replaces a hand-maintained catalog for OpenRouter models. The static
 * lists in src/lib exist because vendors ship models faster than a file gets
 * edited, and a stale list is how a retired model ended up 404ing in
 * production. OpenRouter publishes its catalog — IDs, names, context length
 * and prices — so for it the list is fetched, not typed.
 *
 * Prices come back as USD per token in decimal strings. They are converted
 * to the per-million figures ModelPricing stores, in Decimal, never a float:
 * a $0.0000025 rate that rounds badly on the way in is a wrong invoice later.
 */
const MODELS_URL = "https://openrouter.ai/api/v1/models"

/** The catalog changes daily, not per second; ten minutes keeps the picker snappy. */
const CACHE_TTL_MS = 10 * 60_000

const MILLION = new Decimal(1_000_000)

interface RawModel {
  id?: unknown
  name?: unknown
  context_length?: unknown
  pricing?: {
    prompt?: unknown
    completion?: unknown
    input_cache_read?: unknown
    internal_reasoning?: unknown
  }
}

function perMillion(perToken: unknown): Decimal | null {
  if (typeof perToken !== "string" && typeof perToken !== "number") return null
  let rate: Decimal
  try {
    rate = new Decimal(perToken)
  } catch {
    return null
  }
  // OpenRouter marks a few dynamically priced models with a negative rate.
  // A negative price in the ledger would credit the account; leave it null.
  if (!rate.isFinite() || rate.isNegative()) return null
  return rate.mul(MILLION)
}

/** Plain decimal text without exponent notation — what /api/pricing accepts. */
function money(value: Decimal): string {
  return value.toFixed()
}

/**
 * A cached or reasoning rate of zero means "no separate rate", not "free":
 * the cost engine then bills those tokens at the plain input/output rate,
 * which is what a vendor without discounted caching actually charges.
 */
function separateRate(value: Decimal | null): string | null {
  return value !== null && value.gt(0) ? money(value) : null
}

export function mapCatalogModel(raw: RawModel): OpenRouterCatalogModelDto | null {
  if (typeof raw.id !== "string" || raw.id.length === 0) return null

  const input = perMillion(raw.pricing?.prompt)
  const output = perMillion(raw.pricing?.completion)
  const pricing =
    input !== null && output !== null
      ? {
          inputPerMillion: money(input),
          outputPerMillion: money(output),
          cachedInputPerMillion: separateRate(
            perMillion(raw.pricing?.input_cache_read)
          ),
          reasoningPerMillion: separateRate(
            perMillion(raw.pricing?.internal_reasoning)
          ),
        }
      : null

  return {
    modelId: raw.id,
    displayName: typeof raw.name === "string" && raw.name ? raw.name : raw.id,
    contextLength:
      typeof raw.context_length === "number" && Number.isFinite(raw.context_length)
        ? raw.context_length
        : null,
    pricing,
  }
}

export interface OpenRouterCatalog {
  models: OpenRouterCatalogModelDto[]
  fetchedAt: Date
}

let cache: OpenRouterCatalog | null = null

export interface CatalogOptions {
  /** Optional: the list is public, but a key lets OpenRouter tailor it. */
  apiKey?: string
  fetchFn?: FetchFn
  now?: () => number
}

export async function getOpenRouterCatalog(
  options: CatalogOptions = {}
): Promise<OpenRouterCatalog> {
  const now = options.now ?? Date.now
  if (cache && now() - cache.fetchedAt.getTime() < CACHE_TTL_MS) return cache

  const fetchFn = options.fetchFn ?? fetch
  const headers: Record<string, string> = {}
  if (options.apiKey) headers.Authorization = `Bearer ${options.apiKey}`

  const res = await fetchFn(MODELS_URL, { headers })
  if (!res.ok) {
    throw new Error(`OpenRouter model list failed (${res.status})`)
  }
  const json = (await res.json()) as { data?: unknown }
  if (!Array.isArray(json.data)) {
    throw new Error("OpenRouter model list returned no data array")
  }

  const models = (json.data as RawModel[])
    .map(mapCatalogModel)
    .filter((m): m is OpenRouterCatalogModelDto => m !== null)
    .sort((a, b) => a.modelId.localeCompare(b.modelId))

  cache = { models, fetchedAt: new Date(now()) }
  return cache
}

/** Test helper. */
export function resetOpenRouterCatalogCache(): void {
  cache = null
}
