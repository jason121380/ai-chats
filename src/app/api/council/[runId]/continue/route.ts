import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"

import { prisma } from "@/server/db/prisma"
import { getProviderRegistry } from "@/server/ai/registry"
import { MAX_DISCUSSION_ROUNDS, runDiscussion } from "@/server/council/discussion"
import { loadDiscussionState } from "@/server/council/resume"
import { emitCouncilEvent } from "@/server/council/events"
import { handleRouteError, jsonError } from "@/server/api-helpers"
import type { DiscussionStyleName } from "@/server/council/types"

export const dynamic = "force-dynamic"

const continueSchema = z.object({
  content: z.string().trim().min(1).max(8_000),
  rounds: z.number().int().min(1).max(MAX_DISCUSSION_ROUNDS).default(1),
})

const TERMINAL = ["COMPLETED", "PARTIAL", "FAILED", "CANCELLED"]

/**
 * Reopen a finished discussion with something new to say.
 *
 * `/say` refuses a finished run, and it is right to: a message nobody will
 * read is worse than an error. This is the other half of that — rather than
 * refusing, it puts the participants back in the room for another round with
 * the message already in the transcript, so the first thing the next speaker
 * does is answer it.
 *
 * The same run, not a new one. A follow-up belongs in the meeting it follows,
 * and the cost ledger stays attached to the conversation that incurred it.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { runId: string } }
) {
  try {
    const body = continueSchema.parse(await req.json())

    const run = await prisma.councilRun.findUnique({
      where: { id: params.runId },
      select: {
        id: true,
        sessionId: true,
        kind: true,
        status: true,
        totalRounds: true,
        discussionStyle: true,
        chairmanProvider: true,
        chairmanModel: true,
        userMessage: { select: { content: true } },
      },
    })
    if (!run) return jsonError(404, "找不到這場討論")
    if (run.kind !== "DISCUSSION") {
      return jsonError(400, "只有群組聊天可以繼續")
    }
    // Still running: the loop will pick the message up between turns on its
    // own, so this endpoint has nothing to add and must not start a second
    // loop over the same run.
    if (!TERMINAL.includes(run.status)) {
      return jsonError(409, "這場討論還在進行中，請直接發言")
    }

    const state = await loadDiscussionState(prisma, run.id)
    if (state.participants.length === 0) {
      return jsonError(409, "這場討論沒有任何發言，無法繼續")
    }

    // Only participants that are still enabled and still have an API key can
    // speak. Dropping them here — rather than letting each turn fail inside
    // the loop — is what makes the difference between "two of the four are
    // gone" and a meeting of failed turns nobody can explain.
    const registry = getProviderRegistry()
    const configs = await prisma.modelConfig.findMany({
      where: {
        OR: state.participants.map((p) => ({
          provider: p.provider,
          modelId: p.modelId,
        })),
      },
      select: { provider: true, modelId: true, enabled: true },
    })
    const usableKeys = new Set(
      configs
        .filter((c) => c.enabled && registry.has(c.provider))
        .map((c) => `${c.provider}/${c.modelId}`)
    )
    const speakers = state.participants.filter((p) =>
      usableKeys.has(`${p.provider}/${p.modelId}`)
    )
    if (speakers.length === 0) {
      return jsonError(
        409,
        "原本的與會者都已經不可用（已從設定移除或缺少 API Key），無法繼續這場討論。"
      )
    }

    const summarizer =
      run.chairmanProvider && run.chairmanModel
        ? { provider: run.chairmanProvider, modelId: run.chairmanModel }
        : null
    const summarizerUsable =
      summarizer !== null &&
      registry.has(summarizer.provider) &&
      (await prisma.modelConfig.findUnique({
        where: {
          provider_modelId: {
            provider: summarizer.provider,
            modelId: summarizer.modelId,
          },
        },
        select: { enabled: true },
      }))?.enabled === true

    const startRound = state.lastRound + 1
    const lastRound = startRound + body.rounds - 1

    // The message goes in before the run reopens, so the loop's first drain
    // cannot start a turn that has not seen it.
    await prisma.$transaction(async (tx) => {
      await tx.message.create({
        data: {
          sessionId: run.sessionId,
          councilRunId: run.id,
          role: "USER",
          source: "USER",
          content: body.content,
        },
      })
      await tx.councilRun.update({
        where: { id: run.id },
        data: {
          status: "PENDING",
          currentStage: "DISCUSSION",
          currentRound: startRound,
          totalRounds: lastRound,
          completedAt: null,
          errorMessage: null,
        },
      })
    })

    emitCouncilEvent({
      type: "human.said",
      runId: run.id,
      stage: "DISCUSSION",
    })

    void runDiscussion(
      {
        runId: run.id,
        sessionId: run.sessionId,
        question: run.userMessage?.content ?? "",
        participants: speakers,
        rounds: body.rounds,
        style: (run.discussionStyle ?? "COLLABORATIVE") as DiscussionStyleName,
        summarizer: summarizerUsable ? summarizer : null,
        resume: {
          transcript: state.transcript,
          startRound,
          startTurnIndex: state.nextTurnIndex,
          // The message created just above is deliberately NOT in here, so
          // the loop's first drain claims it and puts it at the head of the
          // continuation — which is the point of the whole endpoint.
          seenInterjectionIds: state.seenInterjectionIds,
        },
      },
      { db: prisma, registry }
    ).catch((err) => {
      // eslint-disable-next-line no-console
      console.error("[discussion] continuation crashed", run.id, err)
    })

    return NextResponse.json(
      { runId: run.id, status: "PENDING", startRound, speakers: speakers.length },
      { status: 202 }
    )
  } catch (err) {
    return handleRouteError(err)
  }
}
