import { NextResponse } from "next/server"

import { getEnv } from "@/lib/env"
import { getOpenRouterCatalog } from "@/server/openrouter/catalog"
import { handleRouteError } from "@/server/api-helpers"

export const dynamic = "force-dynamic"

/**
 * OpenRouter's model catalog for the 設定 picker: IDs, names, context length
 * and per-million prices. Served from here rather than fetched by the
 * browser so the API key never leaves the server and the list is cached
 * once per process instead of once per open dialog.
 */
export async function GET() {
  try {
    const { models, fetchedAt } = await getOpenRouterCatalog({
      apiKey: getEnv().OPENROUTER_API_KEY,
    })
    return NextResponse.json({ models, fetchedAt: fetchedAt.toISOString() })
  } catch (err) {
    return handleRouteError(err)
  }
}
