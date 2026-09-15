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
        councilRuns: {
          orderBy: { createdAt: "asc" },
          // Without these the history transcript shows every model turn and
          // none of what the person themselves said — the one participant
          // reading it back is the one who goes missing.
          include: {
            interjections: {
              orderBy: { createdAt: "asc" },
              select: { id: true, content: true, createdAt: true },
            },
          },
        },
      },
    })
    if (!session) return jsonError(404, "Session not found")

    const modelRuns = await prisma.modelRun.findMany({
      where: { sessionId: session.id },
      orderBy: [
        { roundNumber: "asc" },
        { turnIndex: "asc" },
        { createdAt: "asc" },
      ],
      select: {
        id: true,
        councilRunId: true,
        provider: true,
        modelId: true,
        stage: true,
        role: true,
        status: true,
        roundNumber: true,
        turnIndex: true,
        attemptCount: true,
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
