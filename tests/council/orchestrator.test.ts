import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"

import { getTestDb } from "../helpers/db"
import {
  runCouncil,
  markStaleRuns,
  failInterruptedModelRuns,
} from "@/server/council/orchestrator"
import { anonymize } from "@/server/council/critique"
import { resetCouncilEvents } from "@/server/council/events"
import { ProviderRegistry } from "@/server/ai/registry"
import type { AIProvider } from "@/server/ai/provider"
import type { AIRequest, AIResponse, ProviderName } from "@/server/ai/types"
import { ProviderError } from "@/server/ai/types"
import type { CouncilConfig } from "@/server/council/types"

const db = getTestDb()

const MODEL_IDS: Record<string, string> = {
  OPENAI: "council-gpt",
  ANTHROPIC: "council-claude",
  GOOGLE: "council-gemini",
  XAI: "council-grok",
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
    registry.register({
      provider: name as ProviderName,
      generate: behavior,
    } satisfies AIProvider)
  }
  return registry
}

const sessionIds: string[] = []

async function createRun(): Promise<CouncilConfig> {
  const session = await db.session.create({
    data: { title: "council-test", mode: "COUNCIL" },
  })
  sessionIds.push(session.id)
  const message = await db.message.create({
    data: {
      sessionId: session.id,
      role: "USER",
      source: "USER",
      content: "Should we expand to Vietnam?",
    },
  })
  const run = await db.councilRun.create({
    data: {
      sessionId: session.id,
      userMessageId: message.id,
      chairmanProvider: "OPENAI",
      chairmanModel: MODEL_IDS.OPENAI,
    },
  })
  return {
    runId: run.id,
    sessionId: session.id,
    question: "Should we expand to Vietnam?",
    models: [
      { provider: "OPENAI", modelId: MODEL_IDS.OPENAI },
      { provider: "ANTHROPIC", modelId: MODEL_IDS.ANTHROPIC },
      { provider: "GOOGLE", modelId: MODEL_IDS.GOOGLE },
      { provider: "XAI", modelId: MODEL_IDS.XAI },
    ],
    chairman: { provider: "OPENAI", modelId: MODEL_IDS.OPENAI },
  }
}

beforeAll(async () => {
  const roles = {
    OPENAI: "STRATEGIST",
    ANTHROPIC: "RISK_ANALYST",
    GOOGLE: "RESEARCHER",
    XAI: "DEVILS_ADVOCATE",
  } as const
  for (const [provider, modelId] of Object.entries(MODEL_IDS)) {
    await db.modelConfig.upsert({
      where: {
        provider_modelId: {
          provider: provider as ProviderName,
          modelId,
        },
      },
      create: {
        provider: provider as ProviderName,
        modelId,
        displayName: modelId,
        enabled: true,
        defaultRole: roles[provider as keyof typeof roles],
      },
      update: { enabled: true },
    })
  }
})

afterEach(() => {
  resetCouncilEvents()
})

afterAll(async () => {
  await db.modelRun.deleteMany({ where: { sessionId: { in: sessionIds } } })
  await db.councilRun.deleteMany({ where: { sessionId: { in: sessionIds } } })
  await db.message.deleteMany({ where: { sessionId: { in: sessionIds } } })
  await db.session.deleteMany({ where: { id: { in: sessionIds } } })
  await db.modelConfig.deleteMany({
    where: { modelId: { in: Object.values(MODEL_IDS) } },
  })
})

describe("runCouncil", () => {
  it("completes with 9 ModelRuns and a chairman message when all models succeed", async () => {
    const config = await createRun()
    const registry = buildRegistry({
      OPENAI: async () => okResponse("GPT view"),
      ANTHROPIC: async () => okResponse("Claude view"),
      GOOGLE: async () => okResponse("Gemini view"),
      XAI: async () => okResponse("Grok view"),
    })

    await runCouncil(config, { db, registry })

    const run = await db.councilRun.findUniqueOrThrow({
      where: { id: config.runId },
    })
    expect(run.status).toBe("COMPLETED")
    expect(run.completedAt).not.toBeNull()

    const modelRuns = await db.modelRun.findMany({
      where: { councilRunId: config.runId },
    })
    // 4 Round 1 + 4 Critique + 1 Chairman
    expect(modelRuns).toHaveLength(9)
    expect(modelRuns.filter((r) => r.stage === "ROUND_1")).toHaveLength(4)
    expect(modelRuns.filter((r) => r.stage === "CRITIQUE")).toHaveLength(4)
    expect(modelRuns.filter((r) => r.stage === "CHAIRMAN")).toHaveLength(1)

    // Totals aggregate from the ledger: 9 runs * 150 tokens
    expect(run.totalTokens).toBe(1350)
    expect(run.totalInputTokens).toBe(900)
    expect(run.totalOutputTokens).toBe(450)

    // Chairman answer became a conversation message
    const chairmanMessages = await db.message.findMany({
      where: { sessionId: config.sessionId, source: "CHAIRMAN" },
    })
    expect(chairmanMessages).toHaveLength(1)

    // Round 1 roles come from ModelConfig defaults
    const gptRound1 = modelRuns.find(
      (r) => r.stage === "ROUND_1" && r.provider === "OPENAI"
    )
    expect(gptRound1?.role).toBe("STRATEGIST")
  })

  it("keeps identities anonymous in critique and chairman prompts", async () => {
    const config = await createRun()
    const registry = buildRegistry({
      OPENAI: async () => okResponse("GPT distinctive answer"),
      ANTHROPIC: async () => okResponse("Claude distinctive answer"),
      GOOGLE: async () => okResponse("Gemini distinctive answer"),
      XAI: async () => okResponse("Grok distinctive answer"),
    })

    await runCouncil(config, { db, registry })

    const critiqueRuns = await db.modelRun.findMany({
      where: { councilRunId: config.runId, stage: "CRITIQUE" },
    })
    for (const run of critiqueRuns) {
      expect(run.prompt).toContain("Response A")
      expect(run.prompt).not.toMatch(/GPT says|Claude says|Gemini says|Grok says/)
      expect(run.prompt).not.toContain("council-gpt")
      expect(run.prompt).not.toContain("OPENAI")
    }

    const chairmanRun = await db.modelRun.findFirstOrThrow({
      where: { councilRunId: config.runId, stage: "CHAIRMAN" },
    })
    expect(chairmanRun.prompt).toContain("Response A")
    expect(chairmanRun.prompt).not.toContain("council-claude")
  })

  it("continues to critique and finishes PARTIAL when one model fails", async () => {
    const config = await createRun()
    const registry = buildRegistry({
      OPENAI: async () => okResponse("GPT view"),
      ANTHROPIC: async () => okResponse("Claude view"),
      GOOGLE: async () => {
        throw new ProviderError("boom", { code: "SERVER_ERROR", retryable: false })
      },
      XAI: async () => okResponse("Grok view"),
    })

    await runCouncil(config, { db, registry })

    const run = await db.councilRun.findUniqueOrThrow({
      where: { id: config.runId },
    })
    expect(run.status).toBe("PARTIAL")

    const modelRuns = await db.modelRun.findMany({
      where: { councilRunId: config.runId },
    })
    // 4 Round 1 (1 failed) + 3 critiques + 1 chairman
    expect(modelRuns).toHaveLength(8)
    expect(
      modelRuns.filter((r) => r.stage === "ROUND_1" && r.status === "FAILED")
    ).toHaveLength(1)
    expect(modelRuns.filter((r) => r.stage === "CRITIQUE")).toHaveLength(3)

    // Chairman message still produced
    const chairmanMessages = await db.message.count({
      where: { sessionId: config.sessionId, source: "CHAIRMAN" },
    })
    expect(chairmanMessages).toBe(1)
  })

  it("fails the council when every Round 1 model fails, with no chairman call", async () => {
    const config = await createRun()
    const boom: Behavior = async () => {
      throw new ProviderError("all down", {
        code: "SERVER_ERROR",
        retryable: false,
      })
    }
    const registry = buildRegistry({
      OPENAI: boom,
      ANTHROPIC: boom,
      GOOGLE: boom,
      XAI: boom,
    })

    await runCouncil(config, { db, registry })

    const run = await db.councilRun.findUniqueOrThrow({
      where: { id: config.runId },
    })
    expect(run.status).toBe("FAILED")

    const stages = await db.modelRun.groupBy({
      by: ["stage"],
      where: { councilRunId: config.runId },
    })
    expect(stages.map((s) => s.stage)).toEqual(["ROUND_1"])
  })

  it("skips critique with a single Round 1 success and still runs the chairman", async () => {
    const config = await createRun()
    const boom: Behavior = async () => {
      throw new ProviderError("down", { code: "SERVER_ERROR", retryable: false })
    }
    const registry = buildRegistry({
      OPENAI: async () => okResponse("Only GPT made it"),
      ANTHROPIC: boom,
      GOOGLE: boom,
      XAI: boom,
    })

    await runCouncil(config, { db, registry })

    const run = await db.councilRun.findUniqueOrThrow({
      where: { id: config.runId },
    })
    expect(run.status).toBe("PARTIAL")

    const critiqueCount = await db.modelRun.count({
      where: { councilRunId: config.runId, stage: "CRITIQUE" },
    })
    expect(critiqueCount).toBe(0)

    const chairmanRun = await db.modelRun.findFirstOrThrow({
      where: { councilRunId: config.runId, stage: "CHAIRMAN" },
    })
    expect(chairmanRun.status).toBe("COMPLETED")
    expect(chairmanRun.prompt).toContain("critique round was skipped")
  })

  it("marks the run FAILED when the chairman fails, preserving earlier usage", async () => {
    const config = await createRun()
    let chairmanCall = false
    const registry = buildRegistry({
      OPENAI: async (req) => {
        // Round 1 + critique succeed; chairman call fails.
        if (req.systemPrompt?.includes("Chairman of an AI advisory council")) {
          chairmanCall = true
          throw new ProviderError("chairman down", {
            code: "SERVER_ERROR",
            retryable: false,
          })
        }
        return okResponse("GPT view")
      },
      ANTHROPIC: async () => okResponse("Claude view"),
      GOOGLE: async () => okResponse("Gemini view"),
      XAI: async () => okResponse("Grok view"),
    })

    await runCouncil(config, { db, registry })
    expect(chairmanCall).toBe(true)

    const run = await db.councilRun.findUniqueOrThrow({
      where: { id: config.runId },
    })
    expect(run.status).toBe("FAILED")
    expect(run.errorMessage).toContain("Chairman failed")

    // Usage from earlier stages is preserved in the ledger and totals.
    const completed = await db.modelRun.count({
      where: { councilRunId: config.runId, status: "COMPLETED" },
    })
    expect(completed).toBe(8)
    expect(run.totalTokens).toBe(1200)
  })

  it("PARTIAL when a critique fails but chairman succeeds", async () => {
    const config = await createRun()
    const registry = buildRegistry({
      OPENAI: async () => okResponse("GPT view"),
      ANTHROPIC: async (req) => {
        if (req.systemPrompt?.includes("critique round")) {
          throw new ProviderError("critique down", {
            code: "SERVER_ERROR",
            retryable: false,
          })
        }
        return okResponse("Claude view")
      },
      GOOGLE: async () => okResponse("Gemini view"),
      XAI: async () => okResponse("Grok view"),
    })

    await runCouncil(config, { db, registry })

    const run = await db.councilRun.findUniqueOrThrow({
      where: { id: config.runId },
    })
    expect(run.status).toBe("PARTIAL")

    const failedCritiques = await db.modelRun.count({
      where: {
        councilRunId: config.runId,
        stage: "CRITIQUE",
        status: "FAILED",
      },
    })
    expect(failedCritiques).toBe(1)
  })
})

describe("anonymize", () => {
  it("assigns stable labels A, B, C...", () => {
    const labeled = anonymize([
      {
        provider: "OPENAI",
        modelId: "m1",
        role: "GENERAL",
        modelRunId: "1",
        content: "x",
      },
      {
        provider: "XAI",
        modelId: "m2",
        role: "GENERAL",
        modelRunId: "2",
        content: "y",
      },
    ])
    expect(labeled.map((l) => l.label)).toEqual(["A", "B"])
  })
})

describe("markStaleRuns", () => {
  it("marks old non-terminal runs FAILED and leaves fresh/terminal runs alone", async () => {
    const config = await createRun()
    // Simulate an interrupted run stuck in ROUND_1 with an old updatedAt.
    await db.councilRun.update({
      where: { id: config.runId },
      data: { status: "ROUND_1" },
    })
    await db.$executeRaw`UPDATE "CouncilRun" SET "updatedAt" = NOW() - INTERVAL '1 hour' WHERE id = ${config.runId}::uuid`

    const freshConfig = await createRun() // stays PENDING with fresh updatedAt

    const count = await markStaleRuns(db, 15 * 60_000)
    expect(count).toBeGreaterThanOrEqual(1)

    const stale = await db.councilRun.findUniqueOrThrow({
      where: { id: config.runId },
    })
    expect(stale.status).toBe("FAILED")
    expect(stale.errorMessage).toContain("stale")

    const fresh = await db.councilRun.findUniqueOrThrow({
      where: { id: freshConfig.runId },
    })
    expect(fresh.status).toBe("PENDING")
  })

  /**
   * A turn writes partial text every 400ms while it streams and only becomes
   * COMPLETED at the end. Killed mid-stream it keeps RUNNING with a few
   * characters in it, and the transcript draws that as a speaker still
   * typing — under a council the sweep above has already marked FAILED.
   */
  it("closes out the turn that was mid-stream, keeping what it had written", async () => {
    const config = await createRun()
    const stranded = await db.modelRun.create({
      data: {
        sessionId: config.sessionId,
        councilRunId: config.runId,
        provider: "OPENAI",
        modelId: MODEL_IDS.OPENAI as string,
        stage: "DISCUSSION",
        status: "RUNNING",
        prompt: "[user]\nsay something",
        response: "Anthrop",
      },
    })
    await db.$executeRaw`UPDATE "ModelRun" SET "startedAt" = NOW() - INTERVAL '1 hour' WHERE id = ${stranded.id}::uuid`

    const live = await db.modelRun.create({
      data: {
        sessionId: config.sessionId,
        councilRunId: config.runId,
        provider: "ANTHROPIC",
        modelId: MODEL_IDS.ANTHROPIC as string,
        stage: "DISCUSSION",
        status: "RUNNING",
        prompt: "[user]\nsay something",
        startedAt: new Date(),
      },
    })

    await markStaleRuns(db, 15 * 60_000)

    const closed = await db.modelRun.findUniqueOrThrow({
      where: { id: stranded.id },
    })
    expect(closed.status).toBe("FAILED")
    expect(closed.errorCode).toBe("INTERRUPTED")
    expect(closed.completedAt).not.toBeNull()
    // The partial stays: it is evidence of how far the turn got, and the
    // transcript branches on the failed status before it reads the text.
    expect(closed.response).toBe("Anthrop")

    // A turn that started moments ago is still a turn in progress.
    const untouched = await db.modelRun.findUniqueOrThrow({
      where: { id: live.id },
    })
    expect(untouched.status).toBe("RUNNING")
  })

  it("closes out a whole run's turns at once, whatever their age", async () => {
    // What 結束討論 needs: the meeting is being ended now, so the turn that
    // was mid-flight a second ago must stop showing a typing caret too.
    const config = await createRun()
    const justStarted = await db.modelRun.create({
      data: {
        sessionId: config.sessionId,
        councilRunId: config.runId,
        provider: "OPENAI",
        modelId: MODEL_IDS.OPENAI as string,
        stage: "DISCUSSION",
        status: "RUNNING",
        prompt: "[user]\nsay something",
        startedAt: new Date(),
      },
    })

    const count = await failInterruptedModelRuns(db, {
      councilRunId: config.runId,
    })
    expect(count).toBe(1)

    const closed = await db.modelRun.findUniqueOrThrow({
      where: { id: justStarted.id },
    })
    expect(closed.status).toBe("FAILED")
    expect(closed.errorCode).toBe("INTERRUPTED")
  })
})
