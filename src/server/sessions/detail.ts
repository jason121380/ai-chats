import { prisma } from "@/server/db/prisma"
import { markStaleCouncilRuns } from "@/server/council/orchestrator"
import { getSessionCost } from "@/server/usage/analytics"

/**
 * Everything the session detail page shows, in the shape it shows it.
 *
 * Shared by the API route and by the page's own server render. The page
 * renders this into the HTML so the conversation is on screen before any
 * JavaScript has run; the route serves the same thing to the poll that keeps
 * it up to date while a discussion is live. Two readers, one query — because
 * the moment they drift, the first paint and the first poll disagree and the
 * page visibly rewrites itself.
 */
export async function getSessionDetail(id: string) {
  await markStaleCouncilRuns(prisma).catch(() => {})


  const session = await prisma.session.findUnique({
    where: { id },
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
  if (!session) return null

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

  return {
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
  }
}
