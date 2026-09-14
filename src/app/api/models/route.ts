import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import type { ProviderName } from "@prisma/client"

import { prisma } from "@/server/db/prisma"
import { getProviderRegistry } from "@/server/ai/registry"
import { handleRouteError, jsonError } from "@/server/api-helpers"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const [configs, pricing] = await Promise.all([
      prisma.modelConfig.findMany({
        orderBy: [{ sortOrder: "asc" }, { provider: "asc" }],
      }),
      prisma.modelPricing.findMany({
        where: {
          effectiveFrom: { lte: new Date() },
          OR: [{ effectiveTo: null }, { effectiveTo: { gt: new Date() } }],
        },
        orderBy: { effectiveFrom: "desc" },
      }),
    ])

    const registry = getProviderRegistry()
    const priced = new Set(pricing.map((p) => `${p.provider}/${p.modelId}`))

    return NextResponse.json(
      configs.map((c) => ({
        ...c,
        providerConfigured: registry.has(c.provider),
        pricingConfigured: priced.has(`${c.provider}/${c.modelId}`),
      }))
    )
  } catch (err) {
    return handleRouteError(err)
  }
}

const updateSchema = z.object({
  provider: z.string(),
  modelId: z.string(),
  enabled: z.boolean().optional(),
  defaultRole: z
    .enum([
      "STRATEGIST",
      "RISK_ANALYST",
      "RESEARCHER",
      "DEVILS_ADVOCATE",
      "CREATIVE",
      "EXECUTION",
      "CHAIRMAN",
      "GENERAL",
    ])
    .optional(),
  temperature: z.number().min(0).max(2).nullable().optional(),
  maxOutputTokens: z.number().int().positive().nullable().optional(),
  sortOrder: z.number().int().optional(),
})

export async function PATCH(req: NextRequest) {
  try {
    const body = updateSchema.parse(await req.json())
    const existing = await prisma.modelConfig.findUnique({
      where: {
        provider_modelId: {
          provider: body.provider as ProviderName,
          modelId: body.modelId,
        },
      },
    })
    if (!existing) return jsonError(404, "Model config not found")

    const updated = await prisma.modelConfig.update({
      where: { id: existing.id },
      data: {
        ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
        ...(body.defaultRole !== undefined
          ? { defaultRole: body.defaultRole }
          : {}),
        ...(body.temperature !== undefined
          ? { temperature: body.temperature }
          : {}),
        ...(body.maxOutputTokens !== undefined
          ? { maxOutputTokens: body.maxOutputTokens }
          : {}),
        ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {}),
      },
    })
    return NextResponse.json(updated)
  } catch (err) {
    return handleRouteError(err)
  }
}
