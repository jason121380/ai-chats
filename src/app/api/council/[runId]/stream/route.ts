import { prisma } from "@/server/db/prisma"
import { subscribeToCouncilRun } from "@/server/council/events"
import type { CouncilEvent } from "@/server/council/types"

export const dynamic = "force-dynamic"

const TERMINAL = ["COMPLETED", "PARTIAL", "FAILED"]

/**
 * Server-Sent Events stream of council progress. Replays buffered events for
 * clients that connect mid-run, then streams live events until the run ends.
 * If the run is already terminal in the database (e.g. after a restart wiped
 * the in-memory channel), a single terminal event is emitted immediately.
 */
export async function GET(
  _req: Request,
  { params }: { params: { runId: string } }
) {
  const runId = params.runId
  const run = await prisma.councilRun.findUnique({ where: { id: runId } })
  if (!run) {
    return new Response("Council run not found", { status: 404 })
  }

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: CouncilEvent) => {
        controller.enqueue(
          encoder.encode(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
        )
      }

      const subscription = subscribeToCouncilRun(runId)

      const close = () => {
        clearInterval(heartbeat)
        subscription.unsubscribe()
        try {
          controller.close()
        } catch {
          // already closed
        }
      }

      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: heartbeat\n\n`))
        } catch {
          close()
        }
      }, 15_000)

      // Replay buffered history first.
      for (const event of subscription.history) send(event)

      if (subscription.done) {
        close()
        return
      }

      // If the in-memory channel is empty but the DB already shows a terminal
      // state (restart, or client connected very late), finish immediately.
      if (subscription.history.length === 0 && TERMINAL.includes(run.status)) {
        send({
          type: run.status === "FAILED" ? "council.failed" : "council.completed",
          runId,
          status: run.status,
          timestamp: new Date().toISOString(),
        })
        close()
        return
      }

      subscription.onEvent(send)
      subscription.onDone(() => {
        // Give the final event a tick to flush before closing.
        setTimeout(close, 100)
      })
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  })
}
