import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest"

import { getTestDb } from "../helpers/db"
import { backfillMissingCosts } from "@/server/usage/backfill"

/**
 * Pricing calls that were made before their model had a price.
 *
 * The line this must not cross: a filled-in cost is what the call WOULD cost
 * at today's rate, not what it was billed at. If it were written as
 * CALCULATED it would be indistinguishable from a measurement from then on,
 * and 用量 would be reporting an estimate as accounting with nothing left to
 * tell anyone otherwise.
 */

const db = getTestDb()
const MODEL = "backfill-test-model"
const PRICED = "backfill-test-priced"
const sessionIds: string[] = []

async function session() {
  const s = await db.session.create({
    data: { title: "backfill", mode: "SOLO" },
  })
  sessionIds.push(s.id)
  return s.id
}

async function run(
  sessionId: string,
  patch: Record<string, unknown> = {},
  modelId = MODEL
) {
  return db.modelRun.create({
    data: {
      sessionId,
      provider: "OPENAI",
      modelId,
      stage: "SOLO",
      status: "COMPLETED",
      prompt: "…",
      response: "…",
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      totalTokens: 2_000_000,
      pricingStatus: "MISSING",
      ...patch,
    },
  })
}

beforeEach(async () => {
  await db.modelPricing.create({
    data: {
      provider: "OPENAI",
      modelId: MODEL,
      inputPerMillion: "2",
      outputPerMillion: "10",
      effectiveFrom: new Date(),
      source: "test list price",
    },
  })
})

afterEach(async () => {
  await db.modelRun.deleteMany({ where: { sessionId: { in: sessionIds } } })
  await db.councilRun.deleteMany({ where: { sessionId: { in: sessionIds } } })
  await db.message.deleteMany({ where: { sessionId: { in: sessionIds } } })
  await db.session.deleteMany({ where: { id: { in: sessionIds } } })
  sessionIds.length = 0
  await db.modelPricing.deleteMany({
    where: { modelId: { in: [MODEL, PRICED] } },
  })
})

afterAll(async () => {
  await db.modelPricing.deleteMany({
    where: { modelId: { in: [MODEL, PRICED] } },
  })
})

describe("backfilling missing costs", () => {
  // Counts are asserted with `toBeGreaterThanOrEqual`, never `toBe`. The
  // backfill scans the whole table by design — "price everything that has no
  // price" — so its totals include rows this file did not create. An exact
  // count here passes on an empty database and fails on a real one, which is
  // the worst way round.
  it("prices a call that had none", async () => {
    const sid = await session()
    const created = await run(sid)

    const result = await backfillMissingCosts(db)
    expect(result.filled).toBeGreaterThanOrEqual(1)

    const after = await db.modelRun.findUniqueOrThrow({
      where: { id: created.id },
    })
    // 1M in at $2 + 1M out at $10.
    expect(after.totalCostUsd?.toString()).toBe("12")
  })

  it("marks it an estimate, not a measurement", async () => {
    const sid = await session()
    const created = await run(sid)
    await backfillMissingCosts(db)

    const after = await db.modelRun.findUniqueOrThrow({
      where: { id: created.id },
    })
    expect(after.pricingStatus).toBe("ESTIMATED")
    expect(after.pricingStatus).not.toBe("CALCULATED")
    // And says so in the row, so the reason survives outside this codebase.
    expect(after.pricingSource).toContain("事後估算")
    expect(after.pricingSource).toContain("test list price")
  })

  it("never touches a cost that was measured at call time", async () => {
    const sid = await session()
    const created = await run(sid, {
      pricingStatus: "CALCULATED",
      totalCostUsd: "0.5",
      inputPricePerMillionUsd: "0.1",
      pricingSource: "原始快照",
    })

    await backfillMissingCosts(db)

    const after = await db.modelRun.findUniqueOrThrow({
      where: { id: created.id },
    })
    expect(after.totalCostUsd?.toString()).toBe("0.5")
    expect(after.pricingSource).toBe("原始快照")
  })

  it("leaves a model that still has no price alone, and says how many", async () => {
    const sid = await session()
    const unpriced = await run(sid, {}, PRICED)

    const result = await backfillMissingCosts(db)
    expect(result.skipped).toBeGreaterThanOrEqual(1)

    const after = await db.modelRun.findUniqueOrThrow({
      where: { id: unpriced.id },
    })
    expect(after.pricingStatus).toBe("MISSING")
    expect(after.totalCostUsd).toBeNull()
  })

  it("skips a call the provider never reported tokens for", async () => {
    const sid = await session()
    const created = await run(sid, {
      inputTokens: null,
      outputTokens: null,
      totalTokens: null,
    })
    await backfillMissingCosts(db)
    const after = await db.modelRun.findUniqueOrThrow({
      where: { id: created.id },
    })
    expect(after.pricingStatus).toBe("MISSING")
    expect(after.totalCostUsd).toBeNull()
  })

  it("refreshes the meeting total above the rows it filled", async () => {
    const sid = await session()
    const message = await db.message.create({
      data: { sessionId: sid, role: "USER", source: "USER", content: "q" },
    })
    const council = await db.councilRun.create({
      data: {
        sessionId: sid,
        userMessageId: message.id,
        kind: "DISCUSSION",
        status: "COMPLETED",
        totalCostUsd: null,
        completedAt: new Date("2026-09-01T00:00:00Z"),
      },
    })
    await run(sid, { councilRunId: council.id })
    await run(sid, { councilRunId: council.id })

    await backfillMissingCosts(db)

    const after = await db.councilRun.findUniqueOrThrow({
      where: { id: council.id },
    })
    expect(after.totalCostUsd?.toString()).toBe("24")
    // The meeting ended when it ended; pricing it later does not restate that.
    expect(after.completedAt?.toISOString()).toBe("2026-09-01T00:00:00.000Z")
    expect(after.status).toBe("COMPLETED")
  })

  it("is a no-op the second time", async () => {
    const sid = await session()
    const created = await run(sid)
    await backfillMissingCosts(db)
    const once = await db.modelRun.findUniqueOrThrow({
      where: { id: created.id },
    })
    await backfillMissingCosts(db)
    const twice = await db.modelRun.findUniqueOrThrow({
      where: { id: created.id },
    })
    // Untouched the second time — not merely re-written to the same value.
    expect(twice.updatedAt.getTime()).toBe(once.updatedAt.getTime())
  })
})
