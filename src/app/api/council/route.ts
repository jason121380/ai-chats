import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import type { ProviderName } from "@prisma/client"

import { prisma } from "@/server/db/prisma"
import { getProviderRegistry } from "@/server/ai/registry"
import { runCouncil } from "@/server/council/orchestrator"
import {
  assertEnabledModel,
  deriveSessionTitle,
  handleRouteError,
  jsonError,
  modelSelectionSchema,
} from "@/server/api-helpers"

export const dynamic = "force-dynamic"

const councilSchema = z.object({
  sessionId: z.string().uuid().optional(),
  message: z.string().min(1).max(32_000),
  models: z.array(modelSelectionSchema).min(1).max(8),
  chairman: modelSelectionSchema,
})

/**
 * Start a council run. Returns immediately with { runId, status: PENDING };
 * execution continues in-process (V1: no durable queue — see stale-run
 * recovery in the orchestrator). Progress via GET /api/council/:runId and
 * the SSE stream.
 */
export async function POST(req: NextRequest) {
  try {
    const body = councilSchema.parse(await req.json())

    // Validate every requested model against ModelConfig (enabled only).
    for (const m of [...body.models, body.chairman]) {
      await assertEnabledModel(prisma, m.provider, m.modelId)
    }

    const registry = getProviderRegistry()
    const unavailable = [...body.models, body.chairman].filter(
      (m) => !registry.has(m.provider as ProviderName)
    )
    if (unavailable.length > 0) {
      return jsonError(
        400,
        `No API key configured for provider(s): ${Array.from(
          new Set(unavailable.map((m) => m.provider))
        ).join(", ")}`
      )
    }

    const session = body.sessionId
      ? await prisma.session.findUniqueOrThrow({
          where: { id: body.sessionId },
        })
      : await prisma.session.create({
          data: { title: deriveSessionTitle(body.message), mode: "COUNCIL" },
        })

    // Session, user message and council run are created atomically.
    const { run } = await prisma.$transaction(async (tx) => {
      const userMessage = await tx.message.create({
        data: {
          sessionId: session.id,
          role: "USER",
          source: "USER",
          content: body.message,
        },
      })
      const run = await tx.councilRun.create({
        data: {
          sessionId: session.id,
          userMessageId: userMessage.id,
          status: "PENDING",
          chairmanProvider: body.chairman.provider as ProviderName,
          chairmanModel: body.chairman.modelId,
        },
      })
      return { run }
    })

    // Fire-and-forget in-process execution.
    void runCouncil(
      {
        runId: run.id,
        sessionId: session.id,
        question: body.message,
        models: body.models.map((m) => ({
          provider: m.provider as ProviderName,
          modelId: m.modelId,
        })),
        chairman: {
          provider: body.chairman.provider as ProviderName,
          modelId: body.chairman.modelId,
        },
      },
      { db: prisma, registry }
    ).catch((err) => {
      // eslint-disable-next-line no-console
      console.error("[council] run crashed", run.id, err)
    })

    return NextResponse.json(
      { runId: run.id, sessionId: session.id, status: "PENDING" },
      { status: 202 }
    )
  } catch (err) {
    return handleRouteError(err)
  }
}
