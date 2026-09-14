import { EventEmitter } from "node:events"

import type { CouncilEvent } from "./types"

/**
 * In-process event hub for council runs.
 *
 * V1 reliability constraint: there is no Redis/worker — council execution is
 * in-process and this is NOT a durable queue. Events are buffered in memory so
 * an SSE client that connects mid-run gets a replay; if the process restarts,
 * clients fall back to polling GET /api/council/:runId (whose stale-run
 * recovery marks interrupted runs FAILED).
 */
interface RunChannel {
  emitter: EventEmitter
  history: CouncilEvent[]
  done: boolean
  cleanupTimer?: NodeJS.Timeout
}

const CHANNEL_TTL_MS = 10 * 60_000

const globalForEvents = globalThis as unknown as {
  councilChannels: Map<string, RunChannel> | undefined
}

function channels(): Map<string, RunChannel> {
  if (!globalForEvents.councilChannels) {
    globalForEvents.councilChannels = new Map()
  }
  return globalForEvents.councilChannels
}

function getChannel(runId: string): RunChannel {
  const map = channels()
  let ch = map.get(runId)
  if (!ch) {
    ch = { emitter: new EventEmitter(), history: [], done: false }
    ch.emitter.setMaxListeners(50)
    map.set(runId, ch)
  }
  return ch
}

export function emitCouncilEvent(
  event: Omit<CouncilEvent, "timestamp"> & { timestamp?: string }
): void {
  const full: CouncilEvent = {
    ...event,
    timestamp: event.timestamp ?? new Date().toISOString(),
  }
  const ch = getChannel(full.runId)
  ch.history.push(full)
  ch.emitter.emit("event", full)

  if (full.type === "council.completed" || full.type === "council.failed") {
    ch.done = true
    ch.emitter.emit("done")
    ch.cleanupTimer = setTimeout(() => {
      channels().delete(full.runId)
    }, CHANNEL_TTL_MS)
    ch.cleanupTimer.unref?.()
  }
}

export interface CouncilSubscription {
  history: CouncilEvent[]
  done: boolean
  onEvent(listener: (event: CouncilEvent) => void): void
  onDone(listener: () => void): void
  unsubscribe(): void
}

export function subscribeToCouncilRun(runId: string): CouncilSubscription {
  const ch = getChannel(runId)
  const eventListeners: Array<(e: CouncilEvent) => void> = []
  const doneListeners: Array<() => void> = []

  return {
    history: [...ch.history],
    done: ch.done,
    onEvent(listener) {
      eventListeners.push(listener)
      ch.emitter.on("event", listener)
    },
    onDone(listener) {
      doneListeners.push(listener)
      ch.emitter.on("done", listener)
    },
    unsubscribe() {
      for (const l of eventListeners) ch.emitter.off("event", l)
      for (const l of doneListeners) ch.emitter.off("done", l)
    },
  }
}

/** Test helper. */
export function resetCouncilEvents(): void {
  channels().clear()
}
