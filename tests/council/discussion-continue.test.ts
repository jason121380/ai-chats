import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"

import { getTestDb } from "../helpers/db"
import { runDiscussion } from "@/server/council/discussion"
import { loadDiscussionState } from "@/server/council/resume"
import { resetCouncilEvents } from "@/server/council/events"
import { ProviderRegistry } from "@/server/ai/registry"
import type { AIRequest, AIResponse, ProviderName } from "@/server/ai/types"
import { HUMAN_SPEAKER_NAME } from "@/server/council/types"

/**
 * Picking a finished discussion back up.
 *
 * The thing these tests defend is that a continuation is ONE meeting, not two.
 * Rounds count on, turn indexes count on, the transcript the second batch of
 * speakers reads contains everything from the first — and, the failure that
 * took the longest to see, the person's earlier messages are not replayed to
 * them as though they had just been typed.
 */

const db = getTestDb()

const MODELS: Record<string, string> = {
  OPENAI: "cont-gpt",
  ANTHROPIC: "cont-claude",
}
const DISPLAY: Record<string, string> = {
  OPENAI: "GPT Test",
  ANTHROPIC: "Claude Test",
}

const sessionIds: string[] = []

/** Every prompt the fake models were shown, so the transcript can be read back. */
let prompts: string[] = []

function registry(): ProviderRegistry {
  const reg = new ProviderRegistry()
  const generate = async (req: AIRequest): Promise<AIResponse> => {
    prompts.push(
      [req.systemPrompt ?? "", ...req.messages.map((m) => m.content)].join("\n")
    )
    return {
      content: `${req.model} 說話`,
      usage: {
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        cachedInputTokens: null,
        reasoningTokens: null,
        rawUsage: {},
      },
      finishReason: "stop",
    }
  }
  for (const provider of Object.keys(MODELS)) {
    reg.register({ provider: provider as ProviderName, generate })
  }
  return reg
}

const participants = Object.entries(MODELS).map(([provider, modelId]) => ({
  provider: provider as ProviderName,
  modelId,
}))

async function openMeeting(rounds: number) {
  const question = "Should we expand to Vietnam?"
  const session = await db.session.create({
    data: { title: question, mode: "DISCUSSION" },
  })
  sessionIds.push(session.id)
  const message = await db.message.create({
    data: {
      sessionId: session.id,
      role: "USER",
      source: "USER",
      content: question,
    },
  })
  const run = await db.councilRun.create({
    data: {
      sessionId: session.id,
      userMessageId: message.id,
      kind: "DISCUSSION",
      totalRounds: rounds,
    },
  })
  await runDiscussion(
    {
      runId: run.id,
      sessionId: session.id,
      question,
      participants,
      rounds,
      style: "COLLABORATIVE",
      summarizer: null,
    },
    { db, registry: registry() }
  )
  return { runId: run.id, sessionId: session.id, question }
}

/** What the /continue route does, minus the HTTP. */
async function continueMeeting(
  meeting: { runId: string; sessionId: string; question: string },
  content: string,
  rounds = 1
) {
  // Only the continuation's prompts are of interest; the opening meeting's
  // are what a caller would already have seen.
  prompts = []
  const state = await loadDiscussionState(db, meeting.runId)
  await db.message.create({
    data: {
      sessionId: meeting.sessionId,
      councilRunId: meeting.runId,
      role: "USER",
      source: "USER",
      content,
    },
  })
  await runDiscussion(
    {
      runId: meeting.runId,
      sessionId: meeting.sessionId,
      question: meeting.question,
      participants: state.participants,
      rounds,
      style: "COLLABORATIVE",
      summarizer: null,
      resume: {
        transcript: state.transcript,
        startRound: state.lastRound + 1,
        startTurnIndex: state.nextTurnIndex,
        seenInterjectionIds: state.seenInterjectionIds,
      },
    },
    { db, registry: registry() }
  )
  return state
}

beforeAll(async () => {
  for (const [provider, modelId] of Object.entries(MODELS)) {
    await db.modelConfig.upsert({
      where: {
        provider_modelId: { provider: provider as ProviderName, modelId },
      },
      create: {
        provider: provider as ProviderName,
        modelId,
        displayName: DISPLAY[provider] as string,
        enabled: true,
        defaultRole: "GENERAL",
      },
      update: { enabled: true, displayName: DISPLAY[provider] as string },
    })
  }
})

afterEach(() => {
  resetCouncilEvents()
  prompts = []
})

afterAll(async () => {
  await db.modelRun.deleteMany({ where: { sessionId: { in: sessionIds } } })
  await db.councilRun.deleteMany({ where: { sessionId: { in: sessionIds } } })
  await db.message.deleteMany({ where: { sessionId: { in: sessionIds } } })
  await db.session.deleteMany({ where: { id: { in: sessionIds } } })
  await db.modelConfig.deleteMany({
    where: { modelId: { in: Object.values(MODELS) } },
  })
})

describe("continuing a finished discussion", () => {
  it("counts rounds and turns on rather than restarting them", async () => {
    const meeting = await openMeeting(1)
    await continueMeeting(meeting, "再想一下預算")

    const turns = await db.modelRun.findMany({
      where: { councilRunId: meeting.runId, stage: "DISCUSSION" },
      orderBy: [{ roundNumber: "asc" }, { turnIndex: "asc" }],
      select: { roundNumber: true, turnIndex: true },
    })
    expect(turns).toEqual([
      { roundNumber: 1, turnIndex: 0 },
      { roundNumber: 1, turnIndex: 1 },
      // Round 2, and the indexes continue — a restart would repeat 1/0 and 1/1
      // and the transcript would render two first rounds.
      { roundNumber: 2, turnIndex: 3 },
      { roundNumber: 2, turnIndex: 4 },
    ])
  })

  it("puts the new message in front of the next speaker", async () => {
    const meeting = await openMeeting(1)
    await continueMeeting(meeting, "預算上限是 5000 萬")

    // The first prompt of the continuation is the one that matters: the
    // speaker must be looking at the message that reopened the meeting.
    // Attributed to the person, not floating in the transcript unowned: the
    // speaker has to know who is asking before it decides who to answer.
    expect(prompts[0]).toContain(`${HUMAN_SPEAKER_NAME}:`)
    expect(prompts[0]).toContain("預算上限是 5000 萬")
    // And last, so the speaker treats it as the thing on the table.
    expect(prompts[0]?.lastIndexOf("預算上限是 5000 萬")).toBeGreaterThan(
      prompts[0]?.lastIndexOf("cont-claude 說話") ?? 0
    )
  })

  it("shows the continuation everything said before it", async () => {
    const meeting = await openMeeting(1)
    await continueMeeting(meeting, "再想一下")
    expect(prompts[0]).toContain("cont-gpt 說話")
    expect(prompts[0]).toContain("cont-claude 說話")
  })

  it("does not replay an earlier interjection as though it were new", async () => {
    const meeting = await openMeeting(1)
    await continueMeeting(meeting, "第一次插話")
    await continueMeeting(meeting, "第二次插話")

    // "第一次插話" belongs in the transcript once, in its original place —
    // not again at the bottom, where it reads as the most recent thing said.
    const occurrences = (prompts[0] ?? "").split("第一次插話").length - 1
    expect(occurrences).toBe(1)
  })

  it("keeps the meeting's original start time", async () => {
    const meeting = await openMeeting(1)
    const before = await db.councilRun.findUniqueOrThrow({
      where: { id: meeting.runId },
      select: { startedAt: true },
    })
    await continueMeeting(meeting, "再想一下")
    const after = await db.councilRun.findUniqueOrThrow({
      where: { id: meeting.runId },
      select: { startedAt: true, status: true },
    })
    expect(after.startedAt?.getTime()).toBe(before.startedAt?.getTime())
    expect(after.status).toBe("COMPLETED")
  })

  it("keeps every model call on the same run, so the cost stays together", async () => {
    const meeting = await openMeeting(1)
    await continueMeeting(meeting, "再想一下")
    const runs = await db.councilRun.findMany({
      where: { sessionId: meeting.sessionId },
    })
    expect(runs).toHaveLength(1)
  })
})
