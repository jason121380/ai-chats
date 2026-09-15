import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import type { ProviderName } from "@prisma/client"

import { prisma } from "@/server/db/prisma"
import { getProviderRegistry } from "@/server/ai/registry"
import {
  MAX_DISCUSSION_ROUNDS,
  runDiscussion,
} from "@/server/council/discussion"
import {
  assertEnabledModel,
  deriveSessionTitle,
  handleRouteError,
  jsonError,
  modelSelectionSchema,
} from "@/server/api-helpers"

export const dynamic = "force-dynamic"

const discussionSchema = z.object({
  sessionId: z.string().uuid().optional(),
  message: z.string().min(1).max(32_000),
  participants: z.array(modelSelectionSchema).min(2).max(6),
  rounds: z.number().int().min(1).max(MAX_DISCUSSION_ROUNDS).default(2),
  style: z.enum(["COLLABORATIVE", "DEBATE"]).default("COLLABORATIVE"),
  /** Optional — a discussion can end without a closing summary. */
  summarizer: modelSelectionSchema.nullable().optional(),
})

/**
 * Start a group discussion. Same contract as /api/council: returns
 * { runId, status: "PENDING" } immediately and runs in-process, with
 * progress on GET /api/council/:runId and its SSE stream.
 */
export async function POST(req: NextRequest) {
  try {
    const body = discussionSchema.parse(await req.json())

    const summarizer = body.summarizer ?? null
    const allModels = summarizer
      ? [...body.participants, summarizer]
      : body.participants

    for (const m of allModels) {
      await assertEnabledModel(prisma, m.provider, m.modelId)
    }

    const registry = getProviderRegistry()
    const unavailable = allModels.filter(
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
          data: {
            title: deriveSessionTitle(body.message),
            mode: "DISCUSSION",
          },
        })

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
          kind: "DISCUSSION",
          status: "PENDING",
          totalRounds: body.rounds,
          discussionStyle: body.style,
          chairmanProvider: summarizer
            ? (summarizer.provider as ProviderName)
            : null,
          chairmanModel: summarizer ? summarizer.modelId : null,
        },
      })
      return { run }
    })

    void runDiscussion(
      {
        runId: run.id,
        sessionId: session.id,
        question: body.message,
        participants: body.participants.map((m) => ({
          provider: m.provider as ProviderName,
          modelId: m.modelId,
        })),
        rounds: body.rounds,
        style: body.style,
        summarizer: summarizer
          ? {
              provider: summarizer.provider as ProviderName,
              modelId: summarizer.modelId,
            }
          : null,
      },
      { db: prisma, registry }
    ).catch((err) => {
      // eslint-disable-next-line no-console
      console.error("[discussion] run crashed", run.id, err)
    })

    return NextResponse.json(
      { runId: run.id, sessionId: session.id, status: "PENDING" },
      { status: 202 }
    )
  } catch (err) {
    return handleRouteError(err)
  }
}
