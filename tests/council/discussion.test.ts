import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"

import { getTestDb } from "../helpers/db"
import {
  assignSpeakerNames,
  runDiscussion,
} from "@/server/council/discussion"
import { resetCouncilEvents } from "@/server/council/events"
import { ProviderRegistry } from "@/server/ai/registry"
import type { AIRequest, AIResponse, ProviderName } from "@/server/ai/types"
import { ProviderError } from "@/server/ai/types"
import type { DiscussionConfig } from "@/server/council/types"

const db = getTestDb()

const MODELS: Record<string, string> = {
  OPENAI: "disc-gpt",
  ANTHROPIC: "disc-claude",
  GOOGLE: "disc-gemini",
}

const DISPLAY: Record<string, string> = {
  OPENAI: "GPT Test",
  ANTHROPIC: "Claude Test",
  GOOGLE: "Gemini Test",
}

function okResponse(content: string): AIResponse {
  return {
    content,
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

type Behavior = (req: AIRequest) => Promise<AIResponse>

function buildRegistry(behaviors: Partial<Record<ProviderName, Behavior>>) {
  const registry = new ProviderRegistry()
  for (const [name, behavior] of Object.entries(behaviors)) {
    registry.register({ provider: name as ProviderName, generate: behavior })
  }
  return registry
}

const sessionIds: string[] = []

async function createRun(
  rounds: number,
  withSummary: boolean,
  providers: ProviderName[] = ["OPENAI", "ANTHROPIC", "GOOGLE"]
): Promise<DiscussionConfig> {
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
      chairmanProvider: withSummary ? "OPENAI" : null,
      chairmanModel: withSummary ? MODELS.OPENAI : null,
    },
  })
  return {
    runId: run.id,
    sessionId: session.id,
    question,
    style: "COLLABORATIVE" as const,
    participants: providers.map((p) => ({
      provider: p,
      modelId: MODELS[p],
    })),
    rounds,
    summarizer: withSummary
      ? { provider: "OPENAI", modelId: MODELS.OPENAI }
      : null,
  }
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
        displayName: DISPLAY[provider],
        enabled: true,
        defaultRole: "GENERAL",
      },
      update: { enabled: true, displayName: DISPLAY[provider] },
    })
  }
})

afterEach(() => resetCouncilEvents())

afterAll(async () => {
  await db.modelRun.deleteMany({ where: { sessionId: { in: sessionIds } } })
  await db.councilRun.deleteMany({ where: { sessionId: { in: sessionIds } } })
  await db.message.deleteMany({ where: { sessionId: { in: sessionIds } } })
  await db.session.deleteMany({ where: { id: { in: sessionIds } } })
  await db.modelConfig.deleteMany({
    where: { modelId: { in: Object.values(MODELS) } },
  })
})

describe("assignSpeakerNames", () => {
  it("uses display names from ModelConfig", () => {
    const names = assignSpeakerNames(
      [
        { provider: "OPENAI", modelId: "a" },
        { provider: "ANTHROPIC", modelId: "b" },
      ],
      new Map([
        ["OPENAI/a", "GPT"],
        ["ANTHROPIC/b", "Claude"],
      ])
    )
    expect(names).toEqual(["GPT", "Claude"])
  })

  it("disambiguates duplicate display names so models can address each other", () => {
    const names = assignSpeakerNames(
      [
        { provider: "OPENAI", modelId: "a" },
        { provider: "OPENAI", modelId: "a" },
        { provider: "OPENAI", modelId: "a" },
      ],
      new Map([["OPENAI/a", "GPT"]])
    )
    expect(names).toEqual(["GPT", "GPT (2)", "GPT (3)"])
  })

  it("falls back to the model id when no display name is configured", () => {
    const names = assignSpeakerNames(
      [{ provider: "XAI", modelId: "grok-x" }],
      new Map()
    )
    expect(names).toEqual(["grok-x"])
  })
})

describe("runDiscussion", () => {
  it("runs every participant once per round, in order, and records speaking order", async () => {
    const config = await createRun(2, false)
    const registry = buildRegistry({
      OPENAI: async () => okResponse("GPT speaks"),
      ANTHROPIC: async () => okResponse("Claude speaks"),
      GOOGLE: async () => okResponse("Gemini speaks"),
    })

    await runDiscussion(config, { db, registry })

    const run = await db.councilRun.findUniqueOrThrow({
      where: { id: config.runId },
    })
    expect(run.status).toBe("COMPLETED")
    expect(run.kind).toBe("DISCUSSION")

    const turns = await db.modelRun.findMany({
      where: { councilRunId: config.runId, stage: "DISCUSSION" },
      orderBy: [{ roundNumber: "asc" }, { turnIndex: "asc" }],
    })
    // 3 participants × 2 rounds
    expect(turns).toHaveLength(6)
    expect(turns.map((t) => t.turnIndex)).toEqual([0, 1, 2, 3, 4, 5])
    expect(turns.map((t) => t.roundNumber)).toEqual([1, 1, 1, 2, 2, 2])
    expect(turns.map((t) => t.provider)).toEqual([
      "OPENAI",
      "ANTHROPIC",
      "GOOGLE",
      "OPENAI",
      "ANTHROPIC",
      "GOOGLE",
    ])
    // Ledger totals aggregate as usual
    expect(run.totalTokens).toBe(900)
  })

  it("shows each speaker the full named transcript so far — the opposite of council anonymity", async () => {
    const config = await createRun(2, false)
    const registry = buildRegistry({
      OPENAI: async () => okResponse("Vietnam is a good bet"),
      ANTHROPIC: async () => okResponse("The labor costs are underestimated"),
      GOOGLE: async () => okResponse("Here are three comparable cases"),
    })

    await runDiscussion(config, { db, registry })

    const turns = await db.modelRun.findMany({
      where: { councilRunId: config.runId, stage: "DISCUSSION" },
      orderBy: [{ roundNumber: "asc" }, { turnIndex: "asc" }],
    })

    // First speaker of round 1 sees nobody.
    expect(turns[0].prompt).toContain("Nobody has spoken yet")

    // Second speaker of round 1 sees the first, BY NAME.
    expect(turns[1].prompt).toContain("GPT Test")
    expect(turns[1].prompt).toContain("Vietnam is a good bet")

    // Round 2 opener sees everything from round 1.
    const roundTwoFirst = turns[3]
    expect(roundTwoFirst.prompt).toContain("Vietnam is a good bet")
    expect(roundTwoFirst.prompt).toContain("The labor costs are underestimated")
    expect(roundTwoFirst.prompt).toContain("Here are three comparable cases")

    // Never anonymized — this is a meeting, not a blind review.
    expect(roundTwoFirst.prompt).not.toContain("Response A")
  })

  it("tells the first and last rounds apart in the system prompt", async () => {
    const config = await createRun(3, false, ["OPENAI"])
    const registry = buildRegistry({
      OPENAI: async () => okResponse("ok"),
    })
    await runDiscussion(config, { db, registry })

    const turns = await db.modelRun.findMany({
      where: { councilRunId: config.runId, stage: "DISCUSSION" },
      orderBy: [{ roundNumber: "asc" }],
    })
    expect(turns[0].prompt).toContain("opening round")
    expect(turns[1].prompt).not.toContain("opening round")
    expect(turns[1].prompt).not.toContain("final round")
    expect(turns[2].prompt).toContain("final round")
  })

  it("continues the meeting when one participant fails a turn, ending PARTIAL", async () => {
    const config = await createRun(2, false)
    let geminiCalls = 0
    const registry = buildRegistry({
      OPENAI: async () => okResponse("GPT speaks"),
      ANTHROPIC: async () => okResponse("Claude speaks"),
      GOOGLE: async () => {
        geminiCalls += 1
        if (geminiCalls === 1) {
          throw new ProviderError("rate limited", {
            code: "RATE_LIMITED",
            retryable: false,
          })
        }
        return okResponse("Gemini recovers")
      },
    })

    await runDiscussion(config, { db, registry })

    const run = await db.councilRun.findUniqueOrThrow({
      where: { id: config.runId },
    })
    expect(run.status).toBe("PARTIAL")

    const turns = await db.modelRun.findMany({
      where: { councilRunId: config.runId, stage: "DISCUSSION" },
      orderBy: [{ roundNumber: "asc" }, { turnIndex: "asc" }],
    })
    expect(turns).toHaveLength(6)
    expect(turns[2].status).toBe("FAILED")
    // The failed turn does not enter the transcript others see.
    expect(turns[3].prompt).not.toContain("Gemini recovers")
    // But the participant speaks again next round.
    expect(turns[5].status).toBe("COMPLETED")
  })

  it("fails only when nobody manages to speak", async () => {
    const config = await createRun(1, false)
    const down: Behavior = async () => {
      throw new ProviderError("down", {
        code: "SERVER_ERROR",
        retryable: false,
      })
    }
    const registry = buildRegistry({
      OPENAI: down,
      ANTHROPIC: down,
      GOOGLE: down,
    })

    await runDiscussion(config, { db, registry })

    const run = await db.councilRun.findUniqueOrThrow({
      where: { id: config.runId },
    })
    expect(run.status).toBe("FAILED")
    expect(run.errorMessage).toContain("No participant")

    // No summary was attempted.
    const summaryRuns = await db.modelRun.count({
      where: { councilRunId: config.runId, stage: "CHAIRMAN" },
    })
    expect(summaryRuns).toBe(0)
  })

  it("writes a closing summary as a CHAIRMAN message when a summarizer is set", async () => {
    const config = await createRun(1, true)
    const registry = buildRegistry({
      OPENAI: async (req) =>
        okResponse(
          req.systemPrompt?.includes("closing summary")
            ? "## Executive Summary\nGo, carefully."
            : "GPT speaks"
        ),
      ANTHROPIC: async () => okResponse("Claude speaks"),
      GOOGLE: async () => okResponse("Gemini speaks"),
    })

    await runDiscussion(config, { db, registry })

    const run = await db.councilRun.findUniqueOrThrow({
      where: { id: config.runId },
    })
    expect(run.status).toBe("COMPLETED")

    const summary = await db.modelRun.findFirstOrThrow({
      where: { councilRunId: config.runId, stage: "CHAIRMAN" },
    })
    expect(summary.status).toBe("COMPLETED")
    // The summary sees named contributions, unlike a council chairman.
    expect(summary.prompt).toContain("GPT Test")
    expect(summary.prompt).toContain("[Round 1]")

    const messages = await db.message.findMany({
      where: { sessionId: config.sessionId, source: "CHAIRMAN" },
    })
    expect(messages).toHaveLength(1)
    expect(messages[0].content).toContain("Executive Summary")
  })

  it("keeps the transcript when only the closing summary fails", async () => {
    const config = await createRun(1, true)
    const registry = buildRegistry({
      OPENAI: async (req) => {
        if (req.systemPrompt?.includes("closing summary")) {
          throw new ProviderError("summary down", {
            code: "SERVER_ERROR",
            retryable: false,
          })
        }
        return okResponse("GPT speaks")
      },
      ANTHROPIC: async () => okResponse("Claude speaks"),
      GOOGLE: async () => okResponse("Gemini speaks"),
    })

    await runDiscussion(config, { db, registry })

    const run = await db.councilRun.findUniqueOrThrow({
      where: { id: config.runId },
    })
    // The conversation is the deliverable; a missing summary is PARTIAL, not FAILED.
    expect(run.status).toBe("PARTIAL")
    expect(run.errorMessage).toContain("transcript is intact")

    const spoken = await db.modelRun.count({
      where: {
        councilRunId: config.runId,
        stage: "DISCUSSION",
        status: "COMPLETED",
      },
    })
    expect(spoken).toBe(3)
    // Usage from the discussion survives the summary failure.
    expect(run.totalTokens).toBeGreaterThan(0)
  })

  it("runs without a summarizer at all", async () => {
    const config = await createRun(1, false)
    const registry = buildRegistry({
      OPENAI: async () => okResponse("GPT speaks"),
      ANTHROPIC: async () => okResponse("Claude speaks"),
      GOOGLE: async () => okResponse("Gemini speaks"),
    })

    await runDiscussion(config, { db, registry })

    const run = await db.councilRun.findUniqueOrThrow({
      where: { id: config.runId },
    })
    expect(run.status).toBe("COMPLETED")
    const chairmanRuns = await db.modelRun.count({
      where: { councilRunId: config.runId, stage: "CHAIRMAN" },
    })
    expect(chairmanRuns).toBe(0)
  })

  it("clamps rounds to the supported maximum", async () => {
    const config = await createRun(1, false, ["OPENAI"])
    const registry = buildRegistry({ OPENAI: async () => okResponse("ok") })

    await runDiscussion({ ...config, rounds: 99 }, { db, registry })

    const turns = await db.modelRun.count({
      where: { councilRunId: config.runId, stage: "DISCUSSION" },
    })
    expect(turns).toBe(5)
  })
})
