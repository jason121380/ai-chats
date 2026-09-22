import { NextResponse, type NextRequest } from "next/server"

import { prisma } from "@/server/db/prisma"
import { failInterruptedModelRuns } from "@/server/council/orchestrator"
import { emitCouncilEvent } from "@/server/council/events"
import { handleRouteError, jsonError } from "@/server/api-helpers"

export const dynamic = "force-dynamic"

const TERMINAL = ["COMPLETED", "PARTIAL", "FAILED", "CANCELLED"]

const STOPPED_MESSAGE = "這場討論由使用者手動結束。"

/**
 * End a discussion now, rather than waiting for it to be declared stale.
 *
 * Execution is in-process, so a container restart strands a run in a
 * non-terminal state and only COUNCIL_STALE_AFTER_MS — fifteen minutes —
 * turns it into something that can be continued. When the person can already
 * see the meeting is not moving, that wait buys nothing and blocks the one
 * action they want: continuing from the next round.
 *
 * FAILED rather than a status of its own, because that is what happened to
 * the run: it did not reach an answer. The message says who ended it. What
 * was said, and everything it cost, is kept — /continue picks the same run
 * back up from the round after the last one that completed.
 *
 * Safe on a meeting that is genuinely still running: the loop checks for a
 * terminal status between turns and returns without finalizing.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: { runId: string } }
) {
  try {
    const run = await prisma.councilRun.findUnique({
      where: { id: params.runId },
      select: { id: true, status: true },
    })
    if (!run) return jsonError(404, "找不到這場討論")
    if (TERMINAL.includes(run.status)) {
      return jsonError(409, "這場討論已經結束了")
    }

    await prisma.councilRun.update({
      where: { id: run.id },
      data: {
        status: "FAILED",
        completedAt: new Date(),
        errorMessage: STOPPED_MESSAGE,
      },
    })
    // The turn that was mid-stream when everything stopped would otherwise
    // keep its typing caret and its half-written sentence for good.
    await failInterruptedModelRuns(prisma, { councilRunId: run.id })

    emitCouncilEvent({
      type: "council.failed",
      runId: run.id,
      error: STOPPED_MESSAGE,
    })

    return NextResponse.json({ runId: run.id, status: "FAILED" })
  } catch (err) {
    return handleRouteError(err)
  }
}
