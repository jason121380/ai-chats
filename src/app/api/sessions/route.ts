import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"

import { prisma } from "@/server/db/prisma"
import { handleRouteError } from "@/server/api-helpers"

export const dynamic = "force-dynamic"

const createSessionSchema = z.object({
  title: z.string().min(1).max(200),
  mode: z.enum(["SOLO", "COMPARE", "COUNCIL", "BATTLE"]),
})

export async function POST(req: NextRequest) {
  try {
    const body = createSessionSchema.parse(await req.json())
    const session = await prisma.session.create({
      data: { title: body.title, mode: body.mode },
    })
    return NextResponse.json(session, { status: 201 })
  } catch (err) {
    return handleRouteError(err)
  }
}

export async function GET() {
  try {
    const sessions = await prisma.session.findMany({
      orderBy: { updatedAt: "desc" },
      take: 100,
    })

    // Per-session cost summary straight from the ModelRun ledger.
    const summaries = await prisma.modelRun.groupBy({
      by: ["sessionId"],
      where: { sessionId: { in: sessions.map((s) => s.id) } },
      _count: { _all: true },
      _sum: { totalTokens: true, totalCostUsd: true },
    })
    const bySession = new Map(summaries.map((s) => [s.sessionId, s]))

    return NextResponse.json(
      sessions.map((s) => {
        const summary = bySession.get(s.id)
        return {
          ...s,
          totalTokens: summary?._sum.totalTokens ?? 0,
          totalCostUsd: summary?._sum.totalCostUsd?.toString() ?? null,
          modelCalls: summary?._count._all ?? 0,
        }
      })
    )
  } catch (err) {
    return handleRouteError(err)
  }
}
