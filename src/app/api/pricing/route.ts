import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import type { ProviderName } from "@prisma/client"

import { prisma } from "@/server/db/prisma"
import { handleRouteError, providerNameSchema } from "@/server/api-helpers"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const rows = await prisma.modelPricing.findMany({
      orderBy: [{ provider: "asc" }, { modelId: "asc" }, { effectiveFrom: "desc" }],
    })
    return NextResponse.json(
      rows.map((r) => ({
        ...r,
        inputPerMillion: r.inputPerMillion.toString(),
        outputPerMillion: r.outputPerMillion.toString(),
        cachedInputPerMillion: r.cachedInputPerMillion?.toString() ?? null,
        reasoningPerMillion: r.reasoningPerMillion?.toString() ?? null,
      }))
    )
  } catch (err) {
    return handleRouteError(err)
  }
}

const createPricingSchema = z.object({
  provider: providerNameSchema,
  modelId: z.string().min(1),
  inputPerMillion: z.string().regex(/^\d+(\.\d+)?$/),
  outputPerMillion: z.string().regex(/^\d+(\.\d+)?$/),
  cachedInputPerMillion: z
    .string()
    .regex(/^\d+(\.\d+)?$/)
    .nullable()
    .optional(),
  reasoningPerMillion: z
    .string()
    .regex(/^\d+(\.\d+)?$/)
    .nullable()
    .optional(),
  effectiveFrom: z.string().datetime().optional(),
  source: z.string().max(500).optional(),
})

/**
 * Add a NEW pricing row. Existing rows are never mutated — the previous
 * active row is closed (effectiveTo) so historical ModelRun snapshots stay
 * untouched.
 */
export async function POST(req: NextRequest) {
  try {
    const body = createPricingSchema.parse(await req.json())
    const effectiveFrom = body.effectiveFrom
      ? new Date(body.effectiveFrom)
      : new Date()

    const created = await prisma.$transaction(async (tx) => {
      await tx.modelPricing.updateMany({
        where: {
          provider: body.provider as ProviderName,
          modelId: body.modelId,
          effectiveTo: null,
        },
        data: { effectiveTo: effectiveFrom },
      })
      return tx.modelPricing.create({
        data: {
          provider: body.provider as ProviderName,
          modelId: body.modelId,
          inputPerMillion: body.inputPerMillion,
          outputPerMillion: body.outputPerMillion,
          cachedInputPerMillion: body.cachedInputPerMillion ?? null,
          reasoningPerMillion: body.reasoningPerMillion ?? null,
          effectiveFrom,
          source: body.source ?? "manual",
        },
      })
    })

    return NextResponse.json(created, { status: 201 })
  } catch (err) {
    return handleRouteError(err)
  }
}
