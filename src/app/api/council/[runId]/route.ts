import { NextResponse } from "next/server"

import { prisma } from "@/server/db/prisma"
import { handleRouteError, jsonError } from "@/server/api-helpers"
import { markStaleCouncilRuns } from "@/server/council/orchestrator"

export const dynamic = "force-dynamic"

export async function GET(
  _req: Request,
  { params }: { params: { runId: string } }
) {
  try {
    await markStaleCouncilRuns(prisma).catch(() => {})

    const run = await prisma.councilRun.findUnique({
      where: { id: params.runId },
      include: {
        userMessage: true,
        modelRuns: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            provider: true,
            modelId: true,
            stage: true,
            role: true,
            status: true,
            response: true,
            latencyMs: true,
            attemptCount: true,
            inputTokens: true,
            outputTokens: true,
            totalTokens: true,
            cachedInputTokens: true,
            reasoningTokens: true,
            inputCostUsd: true,
            outputCostUsd: true,
            cachedInputCostUsd: true,
            reasoningCostUsd: true,
            totalCostUsd: true,
            pricingStatus: true,
            errorCode: true,
            errorMessage: true,
            startedAt: true,
            completedAt: true,
          },
        },
      },
    })
    if (!run) return jsonError(404, "Council run not found")

    const chairmanMessage = await prisma.message.findFirst({
      where: {
        sessionId: run.sessionId,
        source: "CHAIRMAN",
        modelRun: { councilRunId: run.id },
      },
    })

    return NextResponse.json({
      ...run,
      totalCostUsd: run.totalCostUsd?.toString() ?? null,
      modelRuns: run.modelRuns.map((r) => ({
        ...r,
        inputCostUsd: r.inputCostUsd?.toString() ?? null,
        outputCostUsd: r.outputCostUsd?.toString() ?? null,
        cachedInputCostUsd: r.cachedInputCostUsd?.toString() ?? null,
        reasoningCostUsd: r.reasoningCostUsd?.toString() ?? null,
        totalCostUsd: r.totalCostUsd?.toString() ?? null,
      })),
      finalAnswer: chairmanMessage?.content ?? null,
    })
  } catch (err) {
    return handleRouteError(err)
  }
}
