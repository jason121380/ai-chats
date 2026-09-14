import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import type { ProviderName } from "@prisma/client"

import { prisma } from "@/server/db/prisma"
import { getProviderRegistry } from "@/server/ai/registry"
import { executeModelRun } from "@/server/ai/router"
import {
  deriveSessionTitle,
  handleRouteError,
  modelSelectionSchema,
} from "@/server/api-helpers"

export const dynamic = "force-dynamic"

const compareSchema = z.object({
  sessionId: z.string().uuid().optional(),
  message: z.string().min(1).max(32_000),
  models: z.array(modelSelectionSchema).min(1).max(8),
})

/**
 * Compare mode: the same question goes to several models in parallel.
 * No critique, no chairman — but every call still creates its ModelRun
 * ledger row with tokens / cost / latency / status.
 */
export async function POST(req: NextRequest) {
  try {
    const body = compareSchema.parse(await req.json())

    const session = body.sessionId
      ? await prisma.session.findUniqueOrThrow({
          where: { id: body.sessionId },
        })
      : await prisma.session.create({
          data: { title: deriveSessionTitle(body.message), mode: "COMPARE" },
        })

    const userMessage = await prisma.message.create({
      data: {
        sessionId: session.id,
        role: "USER",
        source: "USER",
        content: body.message,
      },
    })

    const registry = getProviderRegistry()

    const outcomes = await Promise.allSettled(
      body.models.map((m) =>
        executeModelRun(
          {
            sessionId: session.id,
            provider: m.provider as ProviderName,
            modelId: m.modelId,
            stage: "COMPARE",
            messages: [{ role: "user", content: body.message }],
          },
          { db: prisma, registry }
        )
      )
    )

    const results = []
    for (let i = 0; i < outcomes.length; i++) {
      const o = outcomes[i]
      if (o.status === "fulfilled") {
        const run = await prisma.modelRun.findUniqueOrThrow({
          where: { id: o.value.modelRunId },
        })
        results.push({
          provider: run.provider,
          modelId: run.modelId,
          status: run.status,
          response: run.response,
          latencyMs: run.latencyMs,
          inputTokens: run.inputTokens,
          outputTokens: run.outputTokens,
          totalTokens: run.totalTokens,
          totalCostUsd: run.totalCostUsd?.toString() ?? null,
          pricingStatus: run.pricingStatus,
          errorCode: run.errorCode,
          errorMessage: run.errorMessage,
          modelRunId: run.id,
        })
      } else {
        results.push({
          provider: body.models[i].provider,
          modelId: body.models[i].modelId,
          status: "FAILED" as const,
          response: null,
          errorMessage:
            o.reason instanceof Error ? o.reason.message : String(o.reason),
        })
      }
    }

    return NextResponse.json({
      sessionId: session.id,
      userMessageId: userMessage.id,
      results,
    })
  } catch (err) {
    return handleRouteError(err)
  }
}
