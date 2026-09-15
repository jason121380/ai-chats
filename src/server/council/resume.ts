import type { CouncilRole, PrismaClient, ProviderName } from "@prisma/client"

import { HUMAN_SPEAKER_NAME } from "./types"
import type { DiscussionEntry } from "./types"
import { assignSpeakerNames } from "./discussion"

/** A model turn as it was recorded, before it is placed in speaking order. */
export interface RecordedTurn {
  id: string
  provider: ProviderName
  modelId: string
  role: CouncilRole
  roundNumber: number | null
  turnIndex: number | null
  response: string | null
  startedAt: Date | null
  completedAt: Date | null
}

/** Something the person typed, as it was recorded. */
export interface RecordedInterjection {
  id: string
  content: string
  createdAt: Date
}

export interface DiscussionState {
  transcript: DiscussionEntry[]
  participants: Array<{ provider: ProviderName; modelId: string }>
  /** Highest round that actually produced a turn. */
  lastRound: number
  /** Where the next turn's index continues from. */
  nextTurnIndex: number
  /** Ids of the interjections already placed in `transcript`. */
  seenInterjectionIds: string[]
}

/**
 * Put a finished discussion back into the shape the loop left it in.
 *
 * Ordering is the whole job. A model turn carries `roundNumber` and
 * `turnIndex`, so those order themselves. An interjection carries only a
 * timestamp, so each one is placed after the last model turn that finished
 * before it — the same rule the transcript view uses, and the same position
 * the live loop gave it when it drained between turns. Get this wrong and the
 * models reading the transcript see the person answering a question that had
 * not been asked yet.
 *
 * Pure apart from its inputs, so the ordering can be tested without a
 * database — which is the part worth testing.
 */
export function buildDiscussionState(
  turns: RecordedTurn[],
  interjections: RecordedInterjection[],
  displayNames: Map<string, string>
): DiscussionState {
  const spoken = [...turns]
    .filter((turn) => turn.response !== null && turn.response !== "")
    .sort(
      (a, b) =>
        (a.roundNumber ?? 0) - (b.roundNumber ?? 0) ||
        (a.turnIndex ?? 0) - (b.turnIndex ?? 0)
    )

  // Participants in the order they first spoke, so the round-robin resumes
  // with the same seating. Deduped by provider+modelId.
  const seen = new Set<string>()
  const participants: Array<{ provider: ProviderName; modelId: string }> = []
  for (const turn of spoken) {
    const key = `${turn.provider}/${turn.modelId}`
    if (seen.has(key)) continue
    seen.add(key)
    participants.push({ provider: turn.provider, modelId: turn.modelId })
  }

  // The same naming rule the original run used, so a participant does not
  // change name halfway down the transcript the models read.
  const names = assignSpeakerNames(participants, displayNames)
  const nameByKey = new Map(
    participants.map((p, i) => [`${p.provider}/${p.modelId}`, names[i] as string])
  )

  const timeOf = (turn: RecordedTurn) =>
    new Date(turn.completedAt ?? turn.startedAt ?? 0).getTime()

  const pending = [...interjections].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
  )

  const transcript: DiscussionEntry[] = []
  const seenInterjectionIds: string[] = []
  let turnIndex = 0
  let lastRound = 1

  const pushHuman = (said: RecordedInterjection, roundNumber: number) => {
    seenInterjectionIds.push(said.id)
    transcript.push({
      speakerName: HUMAN_SPEAKER_NAME,
      roundNumber,
      turnIndex: turnIndex++,
      content: said.content,
      isHuman: true,
    })
  }

  // Anything typed before the first model turn opens the transcript.
  const firstTurnAt = spoken[0] ? timeOf(spoken[0]) : Number.POSITIVE_INFINITY
  while (pending[0] && pending[0].createdAt.getTime() < firstTurnAt) {
    pushHuman(pending.shift()!, spoken[0]?.roundNumber ?? 1)
  }

  for (let i = 0; i < spoken.length; i++) {
    const turn = spoken[i] as RecordedTurn
    const round = turn.roundNumber ?? lastRound
    lastRound = Math.max(lastRound, round)
    transcript.push({
      provider: turn.provider,
      modelId: turn.modelId,
      speakerName:
        nameByKey.get(`${turn.provider}/${turn.modelId}`) ?? turn.modelId,
      role: turn.role,
      modelRunId: turn.id,
      roundNumber: round,
      turnIndex: turnIndex++,
      content: turn.response as string,
    })

    // Everything typed between this turn and the next one belongs here.
    const next = spoken[i + 1]
    const until = next ? timeOf(next) : Number.POSITIVE_INFINITY
    while (pending[0] && pending[0].createdAt.getTime() < until) {
      pushHuman(pending.shift()!, round)
    }
  }

  return {
    transcript,
    participants,
    lastRound,
    nextTurnIndex: turnIndex,
    seenInterjectionIds,
  }
}

/** Load a discussion's recorded state straight from the ledger. */
export async function loadDiscussionState(
  db: PrismaClient,
  runId: string
): Promise<DiscussionState> {
  const [turns, interjections] = await Promise.all([
    db.modelRun.findMany({
      where: { councilRunId: runId, stage: "DISCUSSION", status: "COMPLETED" },
      orderBy: [{ roundNumber: "asc" }, { turnIndex: "asc" }],
      select: {
        id: true,
        provider: true,
        modelId: true,
        role: true,
        roundNumber: true,
        turnIndex: true,
        response: true,
        startedAt: true,
        completedAt: true,
      },
    }),
    db.message.findMany({
      where: { councilRunId: runId, source: "USER" },
      orderBy: { createdAt: "asc" },
      select: { id: true, content: true, createdAt: true },
    }),
  ])

  const configs = await db.modelConfig.findMany({
    select: { provider: true, modelId: true, displayName: true },
  })

  return buildDiscussionState(
    turns,
    interjections,
    new Map(configs.map((c) => [`${c.provider}/${c.modelId}`, c.displayName]))
  )
}
