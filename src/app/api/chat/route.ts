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

const chatSchema = z.object({
  sessionId: z.string().uuid().optional(),
  message: z.string().min(1).max(32_000),
  model: modelSelectionSchema,
})

/**
 * Solo chat. Flows through the ModelRouter like everything else:
 * API → ModelRouter → Provider → ModelRun → Message.
 */
export async function POST(req: NextRequest) {
  try {
    const body = chatSchema.parse(await req.json())
    const provider = body.model.provider as ProviderName

    const session = body.sessionId
      ? await prisma.session.findUniqueOrThrow({
          where: { id: body.sessionId },
        })
      : await prisma.session.create({
          data: { title: deriveSessionTitle(body.message), mode: "SOLO" },
        })

    // Conversation history feeds the model (PostgreSQL is the source of
    // truth for conversation state — no provider conversation IDs).
    const history = await prisma.message.findMany({
      where: {
        sessionId: session.id,
        source: { in: ["USER", "MODEL", "CHAIRMAN"] },
      },
      orderBy: { createdAt: "asc" },
      take: 50,
    })

    const userMessage = await prisma.message.create({
      data: {
        sessionId: session.id,
        role: "USER",
        source: "USER",
        content: body.message,
      },
    })

    const outcome = await executeModelRun(
      {
        sessionId: session.id,
        provider,
        modelId: body.model.modelId,
        stage: "SOLO",
        messages: [
          ...history.map((m) => ({
            role:
              m.role === "USER" ? ("user" as const) : ("assistant" as const),
            content: m.content,
          })),
          { role: "user" as const, content: body.message },
        ],
      },
      { db: prisma, registry: getProviderRegistry() }
    )

    let assistantMessage = null
    if (outcome.status === "COMPLETED" && outcome.response) {
      assistantMessage = await prisma.message.create({
        data: {
          sessionId: session.id,
          role: "ASSISTANT",
          source: "MODEL",
          content: outcome.response.content,
          modelRunId: outcome.modelRunId,
        },
      })
    }

    const run = await prisma.modelRun.findUniqueOrThrow({
      where: { id: outcome.modelRunId },
    })

    return NextResponse.json({
      sessionId: session.id,
      userMessageId: userMessage.id,
      message: assistantMessage,
      modelRun: {
        id: run.id,
        provider: run.provider,
        modelId: run.modelId,
        status: run.status,
        latencyMs: run.latencyMs,
        inputTokens: run.inputTokens,
        outputTokens: run.outputTokens,
        totalTokens: run.totalTokens,
        totalCostUsd: run.totalCostUsd?.toString() ?? null,
        pricingStatus: run.pricingStatus,
        errorCode: run.errorCode,
        errorMessage: run.errorMessage,
      },
    })
  } catch (err) {
    return handleRouteError(err)
  }
}
