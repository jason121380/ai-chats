import { NextResponse } from "next/server"
import { z } from "zod"
import type { PrismaClient, ProviderName } from "@prisma/client"

import { PROVIDER_NAMES } from "@/server/ai/types"

export const providerNameSchema = z.enum(
  PROVIDER_NAMES as unknown as [string, ...string[]]
)

export const modelSelectionSchema = z.object({
  provider: providerNameSchema,
  modelId: z.string().min(1).max(200),
})

export function jsonError(status: number, message: string) {
  return NextResponse.json({ error: message }, { status })
}

export function handleRouteError(err: unknown) {
  if (err instanceof z.ZodError) {
    return jsonError(
      400,
      err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")
    )
  }
  const message = err instanceof Error ? err.message : "Internal error"
  // eslint-disable-next-line no-console
  console.error("[api]", message)
  return jsonError(500, message)
}

/**
 * Security: never trust arbitrary provider/model from the frontend.
 * Every model used must exist in ModelConfig and be enabled.
 */
export async function assertEnabledModel(
  db: PrismaClient,
  provider: string,
  modelId: string
): Promise<void> {
  const config = await db.modelConfig.findUnique({
    where: {
      provider_modelId: { provider: provider as ProviderName, modelId },
    },
  })
  if (!config || !config.enabled) {
    throw new Error(`Model ${provider}/${modelId} is not enabled`)
  }
}

export function parseDateRange(searchParams: URLSearchParams): {
  from?: Date
  to?: Date
} {
  const from = searchParams.get("from")
  const to = searchParams.get("to")
  const result: { from?: Date; to?: Date } = {}
  if (from) {
    const d = new Date(from)
    if (!Number.isNaN(d.getTime())) result.from = d
  }
  if (to) {
    const d = new Date(to)
    if (!Number.isNaN(d.getTime())) result.to = d
  }
  return result
}

export function deriveSessionTitle(message: string): string {
  const clean = message.replace(/\s+/g, " ").trim()
  return clean.length > 60 ? `${clean.slice(0, 57)}...` : clean || "New chat"
}
