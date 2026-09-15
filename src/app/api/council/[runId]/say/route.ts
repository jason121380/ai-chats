import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"

import { prisma } from "@/server/db/prisma"
import { emitCouncilEvent } from "@/server/council/events"
import { handleRouteError, jsonError } from "@/server/api-helpers"

export const dynamic = "force-dynamic"

const saySchema = z.object({
  content: z.string().trim().min(1).max(8_000),
})

const TERMINAL = ["COMPLETED", "PARTIAL", "FAILED", "CANCELLED"]

/**
 * Say something inside a running discussion.
 *
 * The message is only stored here; the discussion loop picks it up between
 * turns. That separation is the point — a person typing must never cut into a
 * turn that is already being generated, only into the gap before the next one.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { runId: string } }
) {
  try {
    const body = saySchema.parse(await req.json())

    const run = await prisma.councilRun.findUnique({
      where: { id: params.runId },
      select: { id: true, sessionId: true, kind: true, status: true },
    })
    if (!run) return jsonError(404, "找不到這場討論")
    if (run.kind !== "DISCUSSION") {
      return jsonError(400, "只有圓桌討論可以中途加入發言")
    }
    // Refused rather than silently stored: a message nobody will ever read is
    // worse than an error, because the sender believes it landed.
    if (TERMINAL.includes(run.status)) {
      return jsonError(409, "這場討論已經結束了")
    }

    const message = await prisma.message.create({
      data: {
        sessionId: run.sessionId,
        councilRunId: run.id,
        role: "USER",
        source: "USER",
        content: body.content,
      },
    })

    emitCouncilEvent({
      type: "human.said",
      runId: run.id,
      stage: "DISCUSSION",
    })

    return NextResponse.json(
      { id: message.id, content: message.content, createdAt: message.createdAt },
      { status: 201 }
    )
  } catch (err) {
    return handleRouteError(err)
  }
}
