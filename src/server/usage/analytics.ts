import Decimal from "decimal.js"
import type { PrismaClient, Prisma } from "@prisma/client"

/**
 * Usage analytics. All numbers are aggregated live from the ModelRun ledger —
 * ModelRun IS the billing ledger; CouncilRun totals are only display snapshots.
 */

export interface DateRange {
  from?: Date
  to?: Date
}

function rangeWhere(range: DateRange): Prisma.ModelRunWhereInput {
  if (!range.from && !range.to) return {}
  return {
    createdAt: {
      ...(range.from ? { gte: range.from } : {}),
      ...(range.to ? { lte: range.to } : {}),
    },
  }
}

export interface UsageSummary {
  calls: number
  successfulCalls: number
  failedCalls: number
  inputTokens: number
  outputTokens: number
  cachedInputTokens: number
  reasoningTokens: number
  totalTokens: number
  totalCostUsd: string
  averageLatencyMs: number | null
}

export async function getUsageSummary(
  db: PrismaClient,
  range: DateRange = {}
): Promise<UsageSummary> {
  const where = rangeWhere(range)

  const [calls, successfulCalls, aggregates] = await Promise.all([
    db.modelRun.count({ where }),
    db.modelRun.count({ where: { ...where, status: "COMPLETED" } }),
    db.modelRun.aggregate({
      where,
      _sum: {
        inputTokens: true,
        outputTokens: true,
        cachedInputTokens: true,
        reasoningTokens: true,
        totalTokens: true,
        totalCostUsd: true,
      },
      _avg: { latencyMs: true },
    }),
  ])

  return {
    calls,
    successfulCalls,
    failedCalls: calls - successfulCalls,
    inputTokens: aggregates._sum.inputTokens ?? 0,
    outputTokens: aggregates._sum.outputTokens ?? 0,
    cachedInputTokens: aggregates._sum.cachedInputTokens ?? 0,
    reasoningTokens: aggregates._sum.reasoningTokens ?? 0,
    totalTokens: aggregates._sum.totalTokens ?? 0,
    totalCostUsd: new Decimal(
      aggregates._sum.totalCostUsd?.toString() ?? "0"
    ).toString(),
    averageLatencyMs:
      aggregates._avg.latencyMs !== null
        ? Math.round(aggregates._avg.latencyMs)
        : null,
  }
}

export interface ModelUsageRow {
  provider: string
  modelId: string
  calls: number
  successfulCalls: number
  failedCalls: number
  successRate: number | null
  inputTokens: number
  outputTokens: number
  cachedInputTokens: number
  reasoningTokens: number
  totalTokens: number
  inputCostUsd: string
  outputCostUsd: string
  totalCostUsd: string
  averageCostPerCallUsd: string | null
  averageLatencyMs: number | null
}

export async function getUsageByModel(
  db: PrismaClient,
  range: DateRange = {}
): Promise<ModelUsageRow[]> {
  const where = rangeWhere(range)

  const [grouped, successGrouped] = await Promise.all([
    db.modelRun.groupBy({
      by: ["provider", "modelId"],
      where,
      _count: { _all: true },
      _sum: {
        inputTokens: true,
        outputTokens: true,
        cachedInputTokens: true,
        reasoningTokens: true,
        totalTokens: true,
        inputCostUsd: true,
        outputCostUsd: true,
        totalCostUsd: true,
      },
      _avg: { latencyMs: true },
    }),
    db.modelRun.groupBy({
      by: ["provider", "modelId"],
      where: { ...where, status: "COMPLETED" },
      _count: { _all: true },
    }),
  ])

  const successMap = new Map(
    successGrouped.map((g) => [`${g.provider}/${g.modelId}`, g._count._all])
  )

  const rows = grouped.map((g) => {
    const calls = g._count._all
    const successfulCalls = successMap.get(`${g.provider}/${g.modelId}`) ?? 0
    const totalCost = new Decimal(g._sum.totalCostUsd?.toString() ?? "0")
    const completedWithCost = successfulCalls
    return {
      provider: g.provider,
      modelId: g.modelId,
      calls,
      successfulCalls,
      failedCalls: calls - successfulCalls,
      successRate: calls > 0 ? successfulCalls / calls : null,
      inputTokens: g._sum.inputTokens ?? 0,
      outputTokens: g._sum.outputTokens ?? 0,
      cachedInputTokens: g._sum.cachedInputTokens ?? 0,
      reasoningTokens: g._sum.reasoningTokens ?? 0,
      totalTokens: g._sum.totalTokens ?? 0,
      inputCostUsd: new Decimal(
        g._sum.inputCostUsd?.toString() ?? "0"
      ).toString(),
      outputCostUsd: new Decimal(
        g._sum.outputCostUsd?.toString() ?? "0"
      ).toString(),
      totalCostUsd: totalCost.toString(),
      averageCostPerCallUsd:
        completedWithCost > 0
          ? totalCost.div(completedWithCost).toString()
          : null,
      averageLatencyMs:
        g._avg.latencyMs !== null ? Math.round(g._avg.latencyMs) : null,
    } satisfies ModelUsageRow
  })

  return rows.sort((a, b) =>
    new Decimal(b.totalCostUsd).comparedTo(new Decimal(a.totalCostUsd))
  )
}

export interface ModelRunFilters extends DateRange {
  provider?: string
  modelId?: string
  stage?: string
  status?: string
  sessionId?: string
  councilRunId?: string
  page?: number
  pageSize?: number
}

export async function getModelRuns(db: PrismaClient, filters: ModelRunFilters) {
  const page = Math.max(1, filters.page ?? 1)
  const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 25))

  const where: Prisma.ModelRunWhereInput = {
    ...rangeWhere(filters),
    ...(filters.provider
      ? { provider: filters.provider as Prisma.ModelRunWhereInput["provider"] }
      : {}),
    ...(filters.modelId ? { modelId: filters.modelId } : {}),
    ...(filters.stage
      ? { stage: filters.stage as Prisma.ModelRunWhereInput["stage"] }
      : {}),
    ...(filters.status
      ? { status: filters.status as Prisma.ModelRunWhereInput["status"] }
      : {}),
    ...(filters.sessionId ? { sessionId: filters.sessionId } : {}),
    ...(filters.councilRunId ? { councilRunId: filters.councilRunId } : {}),
  }

  const [total, runs] = await Promise.all([
    db.modelRun.count({ where }),
    db.modelRun.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        sessionId: true,
        councilRunId: true,
        provider: true,
        modelId: true,
        stage: true,
        role: true,
        status: true,
        startedAt: true,
        completedAt: true,
        latencyMs: true,
        attemptCount: true,
        inputTokens: true,
        outputTokens: true,
        totalTokens: true,
        cachedInputTokens: true,
        reasoningTokens: true,
        totalCostUsd: true,
        pricingStatus: true,
        errorCode: true,
        errorMessage: true,
        createdAt: true,
      },
    }),
  ])

  return {
    total,
    page,
    pageSize,
    runs: runs.map((r) => ({
      ...r,
      totalCostUsd: r.totalCostUsd?.toString() ?? null,
    })),
  }
}

export interface SessionCostSummary {
  totalTokens: number
  totalCostUsd: string | null
  modelCalls: number
}

export async function getSessionCost(
  db: PrismaClient,
  sessionId: string
): Promise<SessionCostSummary> {
  const agg = await db.modelRun.aggregate({
    where: { sessionId },
    _count: { _all: true },
    _sum: { totalTokens: true, totalCostUsd: true },
  })
  return {
    totalTokens: agg._sum.totalTokens ?? 0,
    totalCostUsd: agg._sum.totalCostUsd?.toString() ?? null,
    modelCalls: agg._count._all,
  }
}
