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

const ROLES = [
  "STRATEGIST",
  "RISK_ANALYST",
  "RESEARCHER",
  "DEVILS_ADVOCATE",
  "CREATIVE",
  "EXECUTION",
  "CHAIRMAN",
  "GENERAL",
] as const

const createSchema = z.object({
  provider: z.enum(["OPENAI", "ANTHROPIC", "GOOGLE", "XAI"]),
  // Not constrained to the catalog on purpose: the catalog is a shortcut for
  // the picker, not an allow-list. Providers ship models faster than that
  // file is edited, and rejecting an unlisted ID here would make a stale
  // catalog block a model that works.
  modelId: z.string().trim().min(1).max(200),
  displayName: z.string().trim().min(1).max(200),
  defaultRole: z.enum(ROLES).default("GENERAL"),
  supportsReasoning: z.boolean().default(false),
})

/** Add a model configuration. */
export async function POST(req: NextRequest) {
  try {
    const body = createSchema.parse(await req.json())

    const existing = await prisma.modelConfig.findUnique({
      where: {
        provider_modelId: {
          provider: body.provider as ProviderName,
          modelId: body.modelId,
        },
      },
    })
    // Re-adding a model that was turned off should bring it back rather than
    // fail with a duplicate-key error the operator cannot act on.
    if (existing) {
      if (existing.enabled) {
        return jsonError(409, "這個模型已經在清單裡了")
      }
      const revived = await prisma.modelConfig.update({
        where: { id: existing.id },
        data: { enabled: true, displayName: body.displayName },
      })
      return NextResponse.json(revived, { status: 200 })
    }

    const last = await prisma.modelConfig.findFirst({
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    })

    const created = await prisma.modelConfig.create({
      data: {
        provider: body.provider as ProviderName,
        modelId: body.modelId,
        displayName: body.displayName,
        defaultRole: body.defaultRole,
        supportsReasoning: body.supportsReasoning,
        sortOrder: (last?.sortOrder ?? 0) + 1,
        enabled: true,
      },
    })
    return NextResponse.json(created, { status: 201 })
  } catch (err) {
    return handleRouteError(err)
  }
}

const deleteSchema = z.object({
  provider: z.string(),
  modelId: z.string(),
})

/**
 * Remove a model configuration.
 *
 * Safe for the ledger: ModelRun stores `provider` / `modelId` as plain
 * columns with no foreign key to ModelConfig, and the usage and history
 * pages read those columns directly. A deleted model's past calls keep
 * their tokens, their price snapshot and their cost.
 *
 * ModelPricing rows are deliberately left behind. They are keyed by
 * provider+modelId too, so re-adding the same model later finds its prices
 * still in force instead of silently starting to record MISSING again.
 */
export async function DELETE(req: NextRequest) {
  try {
    const body = deleteSchema.parse(await req.json())
    const { count } = await prisma.modelConfig.deleteMany({
      where: {
        provider: body.provider as ProviderName,
        modelId: body.modelId,
      },
    })
    if (count === 0) return jsonError(404, "Model config not found")
    return NextResponse.json({ deleted: count })
  } catch (err) {
    return handleRouteError(err)
  }
}

const updateSchema = z.object({
  provider: z.string(),
  modelId: z.string(),
  enabled: z.boolean().optional(),
  defaultRole: z.enum(ROLES).optional(),
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
