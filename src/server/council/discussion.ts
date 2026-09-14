import type { CouncilRole, PrismaClient, ProviderName } from "@prisma/client"

import { executeModelRun, type ModelRouterDeps } from "@/server/ai/router"
import { emitCouncilEvent } from "./events"
import { finalizeRun } from "./orchestrator"
import {
  buildDiscussionSummarySystemPrompt,
  buildDiscussionSummaryUserPrompt,
  buildDiscussionSystemPrompt,
  buildDiscussionUserPrompt,
} from "./discussion-prompts"
import type { DiscussionConfig, DiscussionTurn } from "./types"

export const MAX_DISCUSSION_ROUNDS = 5

interface Speaker {
  provider: ProviderName
  modelId: string
  name: string
  role: CouncilRole
}

/**
 * Give every participant a distinct display name. Two entries for the same
 * model would otherwise be indistinguishable in the transcript, and the models
 * address each other by name.
 */
export function assignSpeakerNames(
  participants: Array<{ provider: ProviderName; modelId: string }>,
  displayNames: Map<string, string>
): string[] {
  const used = new Map<string, number>()
  return participants.map((p) => {
    const base = displayNames.get(`${p.provider}/${p.modelId}`) ?? p.modelId
    const seen = used.get(base) ?? 0
    used.set(base, seen + 1)
    return seen === 0 ? base : `${base} (${seen + 1})`
  })
}

/**
 * Discussion mode — a group-chat meeting.
 *
 * Unlike the Council, participants are NAMED and every speaker sees the full
 * transcript before speaking, so they can agree, push back and build on each
 * other. Turns are sequential by necessity: a participant cannot react to a
 * message that has not been produced yet.
 *
 *   PENDING → DISCUSSING (round 1..N, round-robin) → [CHAIRMAN summary] → COMPLETED
 *
 * Failure rules mirror the Council's: one participant failing a turn does not
 * end the meeting; the discussion fails only if nobody ever speaks.
 */
export async function runDiscussion(
  config: DiscussionConfig,
  deps: ModelRouterDeps
): Promise<void> {
  const { db } = deps
  const rounds = Math.max(1, Math.min(MAX_DISCUSSION_ROUNDS, config.rounds))

  emitCouncilEvent({ type: "council.started", runId: config.runId })

  try {
    const configs = await db.modelConfig.findMany({
      where: {
        OR: config.participants.map((p) => ({
          provider: p.provider,
          modelId: p.modelId,
        })),
      },
    })
    const roleByKey = new Map<string, CouncilRole>(
      configs.map((c) => [`${c.provider}/${c.modelId}`, c.defaultRole])
    )
    const nameByKey = new Map<string, string>(
      configs.map((c) => [`${c.provider}/${c.modelId}`, c.displayName])
    )

    const names = assignSpeakerNames(config.participants, nameByKey)
    const speakers: Speaker[] = config.participants.map((p, i) => ({
      provider: p.provider,
      modelId: p.modelId,
      name: names[i],
      role:
        p.role ?? roleByKey.get(`${p.provider}/${p.modelId}`) ?? "GENERAL",
    }))
    const participantNames = speakers.map((s) => s.name)

    await db.councilRun.update({
      where: { id: config.runId },
      data: {
        status: "DISCUSSING",
        currentStage: "DISCUSSION",
        currentRound: 1,
        startedAt: new Date(),
      },
    })

    const transcript: DiscussionTurn[] = []
    let failures = 0
    let turnIndex = 0

    for (let round = 1; round <= rounds; round++) {
      await db.councilRun.update({
        where: { id: config.runId },
        data: { currentRound: round },
      })
      emitCouncilEvent({
        type: "round.started",
        runId: config.runId,
        stage: "DISCUSSION",
        roundNumber: round,
      })

      for (const speaker of speakers) {
        const thisTurn = turnIndex
        turnIndex += 1

        emitCouncilEvent({
          type: "model.started",
          runId: config.runId,
          provider: speaker.provider,
          modelId: speaker.modelId,
          stage: "DISCUSSION",
          roundNumber: round,
          turnIndex: thisTurn,
        })

        const outcome = await executeModelRun(
          {
            sessionId: config.sessionId,
            councilRunId: config.runId,
            provider: speaker.provider,
            modelId: speaker.modelId,
            stage: "DISCUSSION",
            role: speaker.role,
            roundNumber: round,
            turnIndex: thisTurn,
            systemPrompt: buildDiscussionSystemPrompt(
              speaker.name,
              speaker.role,
              participantNames,
              round,
              rounds
            ),
            messages: [
              {
                role: "user",
                content: buildDiscussionUserPrompt(config.question, transcript),
              },
            ],
          },
          deps
        )

        if (outcome.status === "COMPLETED" && outcome.response) {
          transcript.push({
            provider: speaker.provider,
            modelId: speaker.modelId,
            speakerName: speaker.name,
            role: speaker.role,
            modelRunId: outcome.modelRunId,
            roundNumber: round,
            turnIndex: thisTurn,
            content: outcome.response.content,
          })
          emitCouncilEvent({
            type: "model.completed",
            runId: config.runId,
            modelRunId: outcome.modelRunId,
            provider: speaker.provider,
            modelId: speaker.modelId,
            stage: "DISCUSSION",
            roundNumber: round,
            turnIndex: thisTurn,
          })
        } else {
          failures += 1
          emitCouncilEvent({
            type: "model.failed",
            runId: config.runId,
            modelRunId: outcome.modelRunId,
            provider: speaker.provider,
            modelId: speaker.modelId,
            stage: "DISCUSSION",
            roundNumber: round,
            turnIndex: thisTurn,
            error: outcome.errorMessage,
          })
          // The meeting continues — one participant losing their connection
          // does not end it.
        }
      }

      emitCouncilEvent({
        type: "round.completed",
        runId: config.runId,
        stage: "DISCUSSION",
        roundNumber: round,
      })
    }

    if (transcript.length === 0) {
      await finalizeRun(
        db,
        config.runId,
        "FAILED",
        "No participant was able to speak"
      )
      emitCouncilEvent({
        type: "council.failed",
        runId: config.runId,
        error: "No participant was able to speak",
      })
      return
    }

    // ── Optional closing summary
    let summaryFailed = false
    if (config.summarizer) {
      await db.councilRun.update({
        where: { id: config.runId },
        data: { status: "CHAIRMAN", currentStage: "CHAIRMAN" },
      })
      emitCouncilEvent({
        type: "chairman.started",
        runId: config.runId,
        provider: config.summarizer.provider,
        modelId: config.summarizer.modelId,
        stage: "CHAIRMAN",
      })

      const outcome = await executeModelRun(
        {
          sessionId: config.sessionId,
          councilRunId: config.runId,
          provider: config.summarizer.provider,
          modelId: config.summarizer.modelId,
          stage: "CHAIRMAN",
          role: "CHAIRMAN",
          systemPrompt: buildDiscussionSummarySystemPrompt(),
          messages: [
            {
              role: "user",
              content: buildDiscussionSummaryUserPrompt(
                config.question,
                transcript
              ),
            },
          ],
        },
        deps
      )

      if (outcome.status === "COMPLETED" && outcome.response) {
        await db.message.create({
          data: {
            sessionId: config.sessionId,
            role: "ASSISTANT",
            source: "CHAIRMAN",
            content: outcome.response.content,
            modelRunId: outcome.modelRunId,
          },
        })
        emitCouncilEvent({
          type: "chairman.completed",
          runId: config.runId,
          modelRunId: outcome.modelRunId,
          provider: config.summarizer.provider,
          modelId: config.summarizer.modelId,
          stage: "CHAIRMAN",
        })
      } else {
        summaryFailed = true
        emitCouncilEvent({
          type: "model.failed",
          runId: config.runId,
          modelRunId: outcome.modelRunId,
          provider: config.summarizer.provider,
          modelId: config.summarizer.modelId,
          stage: "CHAIRMAN",
          error: outcome.errorMessage,
        })
      }
    }

    // A discussion whose transcript survives is not a failed meeting, even if
    // the closing summary could not be written — the conversation is the
    // deliverable, the summary is a convenience.
    const status = failures > 0 || summaryFailed ? "PARTIAL" : "COMPLETED"
    await finalizeRun(
      db,
      config.runId,
      status,
      summaryFailed ? "Closing summary failed; the transcript is intact." : undefined
    )
    emitCouncilEvent({ type: "council.completed", runId: config.runId })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await finalizeRun(db, config.runId, "FAILED", message).catch(() => {})
    emitCouncilEvent({
      type: "council.failed",
      runId: config.runId,
      error: message,
    })
  }
}

/** Rebuild the speaking order of a stored discussion from the ledger. */
export async function loadDiscussionTranscript(
  db: PrismaClient,
  runId: string
) {
  return db.modelRun.findMany({
    where: { councilRunId: runId, stage: "DISCUSSION" },
    orderBy: [{ roundNumber: "asc" }, { turnIndex: "asc" }],
  })
}
