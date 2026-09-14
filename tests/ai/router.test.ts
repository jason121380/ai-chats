import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { getTestDb } from "../helpers/db"
import { executeModelRun } from "@/server/ai/router"
import { ProviderRegistry } from "@/server/ai/registry"
import type { AIProvider } from "@/server/ai/provider"
import type { AIRequest, AIResponse } from "@/server/ai/types"
import { ProviderError } from "@/server/ai/types"
import { emptyUsage } from "@/server/ai/normalize-usage"

const db = getTestDb()

function okResponse(): AIResponse {
  return {
    content: "The answer",
    usage: {
      inputTokens: 1000,
      outputTokens: 500,
      totalTokens: 1500,
      cachedInputTokens: 200,
      reasoningTokens: null,
      rawUsage: { prompt_tokens: 1000 },
    },
    providerRequestId: "req-1",
    finishReason: "stop",
  }
}

function makeProvider(
  impl: (req: AIRequest) => Promise<AIResponse>
): AIProvider {
  return { provider: "OPENAI", generate: impl }
}

let sessionId: string

beforeAll(async () => {
  const session = await db.session.create({
    data: { title: "router-test", mode: "SOLO" },
  })
  sessionId = session.id

  await db.modelConfig.upsert({
    where: {
      provider_modelId: { provider: "OPENAI", modelId: "router-test-model" },
    },
    create: {
      provider: "OPENAI",
      modelId: "router-test-model",
      displayName: "Router Test Model",
      enabled: true,
    },
    update: { enabled: true },
  })

  await db.modelPricing.create({
    data: {
      provider: "OPENAI",
      modelId: "router-test-model",
      inputPerMillion: "2.5",
      outputPerMillion: "10",
      cachedInputPerMillion: "1.25",
      effectiveFrom: new Date("2026-01-01T00:00:00Z"),
      source: "router-test",
    },
  })
})

afterAll(async () => {
  await db.modelRun.deleteMany({ where: { sessionId } })
  await db.session.deleteMany({ where: { id: sessionId } })
  await db.modelPricing.deleteMany({ where: { modelId: "router-test-model" } })
  await db.modelConfig.deleteMany({ where: { modelId: "router-test-model" } })
})

function spec() {
  return {
    sessionId,
    provider: "OPENAI" as const,
    modelId: "router-test-model",
    stage: "SOLO" as const,
    messages: [{ role: "user" as const, content: "Question?" }],
  }
}

describe("executeModelRun", () => {
  it("creates a COMPLETED ModelRun with usage, pricing snapshot and cost", async () => {
    const registry = new ProviderRegistry()
    registry.register(makeProvider(async () => okResponse()))

    const outcome = await executeModelRun(spec(), { db, registry })
    expect(outcome.status).toBe("COMPLETED")
    expect(outcome.response?.content).toBe("The answer")

    const run = await db.modelRun.findUniqueOrThrow({
      where: { id: outcome.modelRunId },
    })
    expect(run.status).toBe("COMPLETED")
    expect(run.inputTokens).toBe(1000)
    expect(run.outputTokens).toBe(500)
    expect(run.cachedInputTokens).toBe(200)
    expect(run.pricingStatus).toBe("CALCULATED")
    expect(run.inputPricePerMillionUsd?.toString()).toBe("2.5")
    // input: 800 @ 2.5/M = 0.002 ; cached: 200 @ 1.25/M = 0.00025 ; output: 500 @ 10/M = 0.005
    expect(run.inputCostUsd?.toString()).toBe("0.002")
    expect(run.cachedInputCostUsd?.toString()).toBe("0.00025")
    expect(run.outputCostUsd?.toString()).toBe("0.005")
    expect(run.totalCostUsd?.toString()).toBe("0.00725")
    expect(run.latencyMs).not.toBeNull()
    expect(run.rawUsage).toEqual({ prompt_tokens: 1000 })
    expect(run.providerRequestId).toBe("req-1")
    expect(run.finishReason).toBe("stop")
  })

  it("marks the run FAILED on non-retryable provider error, keeping error details", async () => {
    const registry = new ProviderRegistry()
    registry.register(
      makeProvider(async () => {
        throw new ProviderError("Invalid API key", {
          code: "AUTH",
          retryable: false,
        })
      })
    )

    const outcome = await executeModelRun(spec(), { db, registry })
    expect(outcome.status).toBe("FAILED")
    expect(outcome.errorCode).toBe("AUTH")

    const run = await db.modelRun.findUniqueOrThrow({
      where: { id: outcome.modelRunId },
    })
    expect(run.status).toBe("FAILED")
    expect(run.errorCode).toBe("AUTH")
    expect(run.errorMessage).toContain("Invalid API key")
  })

  it("retries retryable errors within the SAME ModelRun and records attemptCount", async () => {
    let calls = 0
    const registry = new ProviderRegistry()
    registry.register(
      makeProvider(async () => {
        calls += 1
        if (calls < 3) {
          throw new ProviderError("429", { code: "RATE_LIMITED" })
        }
        return okResponse()
      })
    )

    const outcome = await executeModelRun(spec(), {
      db,
      registry,
      retry: { sleep: () => Promise.resolve() },
    })
    expect(outcome.status).toBe("COMPLETED")

    const run = await db.modelRun.findUniqueOrThrow({
      where: { id: outcome.modelRunId },
    })
    expect(run.attemptCount).toBe(3)
    // one logical operation = one ledger row
    const rows = await db.modelRun.count({
      where: { sessionId, id: outcome.modelRunId },
    })
    expect(rows).toBe(1)
  })

  it("marks the run TIMEOUT when the provider exceeds the deadline", async () => {
    const registry = new ProviderRegistry()
    registry.register(
      makeProvider(
        (req) =>
          new Promise<AIResponse>((_resolve, reject) => {
            req.signal?.addEventListener("abort", () => {
              const err = new Error("aborted")
              err.name = "AbortError"
              reject(err)
            })
          })
      )
    )

    const outcome = await executeModelRun(spec(), {
      db,
      registry,
      timeoutMs: 50,
    })
    expect(outcome.status).toBe("TIMEOUT")

    const run = await db.modelRun.findUniqueOrThrow({
      where: { id: outcome.modelRunId },
    })
    expect(run.status).toBe("TIMEOUT")
    expect(run.errorCode).toBe("TIMEOUT")
    expect(run.latencyMs).not.toBeNull()
  })

  it("still COMPLETES with pricingStatus MISSING when no price is configured", async () => {
    await db.modelConfig.upsert({
      where: {
        provider_modelId: { provider: "OPENAI", modelId: "unpriced-model" },
      },
      create: {
        provider: "OPENAI",
        modelId: "unpriced-model",
        displayName: "Unpriced",
        enabled: true,
      },
      update: { enabled: true },
    })

    const registry = new ProviderRegistry()
    registry.register(makeProvider(async () => okResponse()))

    const outcome = await executeModelRun(
      { ...spec(), modelId: "unpriced-model" },
      { db, registry }
    )
    expect(outcome.status).toBe("COMPLETED")

    const run = await db.modelRun.findUniqueOrThrow({
      where: { id: outcome.modelRunId },
    })
    expect(run.pricingStatus).toBe("MISSING")
    expect(run.totalCostUsd).toBeNull()
    expect(run.inputTokens).toBe(1000)

    await db.modelConfig.deleteMany({ where: { modelId: "unpriced-model" } })
  })

  it("rejects models that are not enabled in ModelConfig", async () => {
    const registry = new ProviderRegistry()
    registry.register(makeProvider(async () => okResponse()))

    await expect(
      executeModelRun({ ...spec(), modelId: "nonexistent-model" }, {
        db,
        registry,
      })
    ).rejects.toThrow(/not configured/)
  })

  it("records usage as null when the provider reports none", async () => {
    const registry = new ProviderRegistry()
    registry.register(
      makeProvider(async () => ({
        content: "no usage",
        usage: emptyUsage(),
      }))
    )

    const outcome = await executeModelRun(spec(), { db, registry })
    const run = await db.modelRun.findUniqueOrThrow({
      where: { id: outcome.modelRunId },
    })
    expect(run.inputTokens).toBeNull()
    expect(run.totalCostUsd).toBeNull()
    expect(run.pricingStatus).toBe("MISSING")
  })
})
