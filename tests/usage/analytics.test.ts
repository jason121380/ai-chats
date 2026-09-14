import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { getTestDb } from "../helpers/db"
import {
  getModelRuns,
  getSessionCost,
  getUsageByModel,
  getUsageSummary,
} from "@/server/usage/analytics"

const db = getTestDb()

let sessionId: string
const BASE = new Date("2026-03-10T12:00:00Z")

// Use an isolated date window so parallel test files can't interfere.
const RANGE = {
  from: new Date("2026-03-01T00:00:00Z"),
  to: new Date("2026-03-31T23:59:59Z"),
}

async function fixtureRun(data: {
  provider: "OPENAI" | "ANTHROPIC"
  modelId: string
  status: "COMPLETED" | "FAILED"
  inputTokens?: number
  outputTokens?: number
  totalCostUsd?: string
  latencyMs?: number
  createdAt?: Date
}) {
  const run = await db.modelRun.create({
    data: {
      sessionId,
      provider: data.provider,
      modelId: data.modelId,
      stage: "SOLO",
      status: data.status,
      prompt: "fixture",
      inputTokens: data.inputTokens ?? null,
      outputTokens: data.outputTokens ?? null,
      totalTokens:
        data.inputTokens !== undefined && data.outputTokens !== undefined
          ? data.inputTokens + data.outputTokens
          : null,
      totalCostUsd: data.totalCostUsd ?? null,
      latencyMs: data.latencyMs ?? null,
    },
  })
  // Pin createdAt deterministically inside the test window.
  await db.$executeRaw`UPDATE "ModelRun" SET "createdAt" = ${
    data.createdAt ?? BASE
  } WHERE id = ${run.id}::uuid`
  return run
}

beforeAll(async () => {
  const session = await db.session.create({
    data: { title: "analytics-test", mode: "SOLO" },
  })
  sessionId = session.id

  await fixtureRun({
    provider: "OPENAI",
    modelId: "an-gpt",
    status: "COMPLETED",
    inputTokens: 1000,
    outputTokens: 500,
    totalCostUsd: "0.01",
    latencyMs: 1000,
  })
  await fixtureRun({
    provider: "OPENAI",
    modelId: "an-gpt",
    status: "COMPLETED",
    inputTokens: 2000,
    outputTokens: 1000,
    totalCostUsd: "0.02",
    latencyMs: 3000,
  })
  await fixtureRun({
    provider: "OPENAI",
    modelId: "an-gpt",
    status: "FAILED",
    latencyMs: 200,
  })
  await fixtureRun({
    provider: "ANTHROPIC",
    modelId: "an-claude",
    status: "COMPLETED",
    inputTokens: 4000,
    outputTokens: 2000,
    totalCostUsd: "0.0001",
    latencyMs: 2000,
  })
  // Outside the date range — must be excluded from range queries.
  await fixtureRun({
    provider: "ANTHROPIC",
    modelId: "an-claude",
    status: "COMPLETED",
    inputTokens: 999_999,
    outputTokens: 999_999,
    totalCostUsd: "99",
    createdAt: new Date("2026-05-01T00:00:00Z"),
  })
})

afterAll(async () => {
  await db.modelRun.deleteMany({ where: { sessionId } })
  await db.session.deleteMany({ where: { id: sessionId } })
})

describe("getUsageSummary", () => {
  it("aggregates calls, tokens, cost and latency within a date range", async () => {
    const summary = await getUsageSummary(db, RANGE)
    expect(summary.calls).toBe(4)
    expect(summary.successfulCalls).toBe(3)
    expect(summary.failedCalls).toBe(1)
    expect(summary.inputTokens).toBe(7000)
    expect(summary.outputTokens).toBe(3500)
    expect(summary.totalTokens).toBe(10500)
    expect(summary.totalCostUsd).toBe("0.0301")
    expect(summary.averageLatencyMs).toBe(1550)
  })

  it("excludes runs outside the range", async () => {
    const summary = await getUsageSummary(db, {
      from: new Date("2026-04-25T00:00:00Z"),
      to: new Date("2026-05-05T00:00:00Z"),
    })
    expect(summary.calls).toBe(1)
    expect(summary.totalCostUsd).toBe("99")
  })
})

describe("getUsageByModel", () => {
  it("aggregates per model with success rate, avg cost/latency, sorted by cost", async () => {
    const rows = await getUsageByModel(db, RANGE)
    const gpt = rows.find((r) => r.modelId === "an-gpt")
    const claude = rows.find((r) => r.modelId === "an-claude")

    expect(gpt).toBeDefined()
    expect(gpt!.calls).toBe(3)
    expect(gpt!.successfulCalls).toBe(2)
    expect(gpt!.successRate).toBeCloseTo(2 / 3)
    expect(gpt!.inputTokens).toBe(3000)
    expect(gpt!.totalCostUsd).toBe("0.03")
    expect(gpt!.averageCostPerCallUsd).toBe("0.015")

    expect(claude).toBeDefined()
    expect(claude!.totalCostUsd).toBe("0.0001")
    // Tiny cost not rounded to zero
    expect(Number(claude!.totalCostUsd)).toBeGreaterThan(0)

    // Sorted by cost descending: gpt before claude
    expect(rows.indexOf(gpt!)).toBeLessThan(rows.indexOf(claude!))
  })
})

describe("getModelRuns", () => {
  it("filters by provider/status and paginates", async () => {
    const page1 = await getModelRuns(db, {
      ...RANGE,
      provider: "OPENAI",
      page: 1,
      pageSize: 2,
    })
    expect(page1.total).toBe(3)
    expect(page1.runs).toHaveLength(2)

    const failed = await getModelRuns(db, {
      ...RANGE,
      provider: "OPENAI",
      status: "FAILED",
    })
    expect(failed.total).toBe(1)
    expect(failed.runs[0].status).toBe("FAILED")
  })
})

describe("getSessionCost", () => {
  it("sums tokens, cost and call count for a session", async () => {
    const cost = await getSessionCost(db, sessionId)
    expect(cost.modelCalls).toBe(5)
    expect(cost.totalTokens).toBe(10500 + 999_999 * 2)
    expect(cost.totalCostUsd).toBe("99.0301")
  })
})
