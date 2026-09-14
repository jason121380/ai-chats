import { NextResponse } from "next/server"

import { prisma } from "@/server/db/prisma"
import { handleRouteError, jsonError } from "@/server/api-helpers"
import { markStaleCouncilRuns } from "@/server/council/orchestrator"
import { getSessionCost } from "@/server/usage/analytics"

export const dynamic = "force-dynamic"

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    await markStaleCouncilRuns(prisma).catch(() => {})

    const session = await prisma.session.findUnique({
      where: { id: params.id },
      include: {
        messages: { orderBy: { createdAt: "asc" } },
        councilRuns: { orderBy: { createdAt: "asc" } },
      },
    })
    if (!session) return jsonError(404, "Session not found")

    const modelRuns = await prisma.modelRun.findMany({
      where: { sessionId: session.id },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        councilRunId: true,
        provider: true,
        modelId: true,
        stage: true,
        role: true,
        status: true,
        response: true,
        latencyMs: true,
        inputTokens: true,
        outputTokens: true,
        totalTokens: true,
        cachedInputTokens: true,
        reasoningTokens: true,
        totalCostUsd: true,
        pricingStatus: true,
        errorCode: true,
        errorMessage: true,
        startedAt: true,
        completedAt: true,
        createdAt: true,
      },
    })

    const cost = await getSessionCost(prisma, session.id)

    return NextResponse.json({
      ...session,
      councilRuns: session.councilRuns.map((r) => ({
        ...r,
        totalCostUsd: r.totalCostUsd?.toString() ?? null,
      })),
      modelRuns: modelRuns.map((r) => ({
        ...r,
        totalCostUsd: r.totalCostUsd?.toString() ?? null,
      })),
      cost,
    })
  } catch (err) {
    return handleRouteError(err)
  }
}
