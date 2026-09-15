import { describe, expect, it, vi } from "vitest"

import { readSseData } from "@/server/ai/providers/sse"
import { streamOpenAICompatible } from "@/server/ai/providers/openai-compatible"
import { collectStream } from "@/server/ai/router"
import type { AIStreamEvent } from "@/server/ai/types"

/**
 * Streaming a turn so its text appears as it is written.
 *
 * Two things here are worth more than the feature itself. Usage arrives only
 * in the final chunk, so a streamed turn that drops it records no cost at
 * all — a display change quietly opening a hole in the billing ledger. And a
 * partial write must never be confused with a finished answer: the row stays
 * RUNNING until the real completion writes text and status together.
 */

/** A body that hands over bytes in exactly the pieces given. */
function bodyOf(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(c))
      controller.close()
    },
  })
}

async function collect<T>(it: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = []
  for await (const v of it) out.push(v)
  return out
}

describe("the SSE reader", () => {
  it("reads one event per data line", async () => {
    const out = await collect(readSseData(bodyOf(["data: a\ndata: b\n"])))
    expect(out).toEqual(["a", "b"])
  })

  it("survives a chunk boundary in the middle of a line", async () => {
    // The hazard that makes this worth extracting: network chunks do not
    // respect line endings, and half an object fails JSON.parse.
    const out = await collect(
      readSseData(bodyOf(['data: {"x":', '1}\ndata: {"x":2}\n']))
    )
    expect(out).toEqual(['{"x":1}', '{"x":2}'])
  })

  it("reads a final line that never got its newline", async () => {
    const out = await collect(readSseData(bodyOf(["data: last"])))
    expect(out).toEqual(["last"])
  })

  it("ignores comments and blank lines", async () => {
    const out = await collect(
      readSseData(bodyOf([": keep-alive\n\ndata: real\n\n"]))
    )
    expect(out).toEqual(["real"])
  })
})

describe("an OpenAI-compatible stream", () => {
  const chunks = [
    'data: {"id":"r1","model":"m","choices":[{"delta":{"content":"越南"}}]}\n',
    'data: {"choices":[{"delta":{"content":"市場"}}]}\n',
    'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n',
    'data: {"usage":{"prompt_tokens":10,"completion_tokens":4,"total_tokens":14}}\n',
    "data: [DONE]\n",
  ]

  const fetchFn = vi.fn(
    async (_url: string, _init: { body: string }) =>
      new Response(bodyOf(chunks), {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      })
  )

  const request = {
    model: "m",
    messages: [{ role: "user" as const, content: "q" }],
  }

  it("yields each delta, then the finished response", async () => {
    const events = await collect(
      streamOpenAICompatible(request, {
        baseUrl: "https://x",
        apiKey: "k",
        fetchFn: fetchFn as never,
      })
    )
    expect(events.filter((e) => e.type === "delta").map((e) => e.delta)).toEqual(
      ["越南", "市場"]
    )
    const done = events.find((e) => e.type === "done")
    expect(done?.response?.content).toBe("越南市場")
    expect(done?.response?.finishReason).toBe("stop")
  })

  it("carries the token counts through, so the turn is still billable", async () => {
    const events = await collect(
      streamOpenAICompatible(request, {
        baseUrl: "https://x",
        apiKey: "k",
        fetchFn: fetchFn as never,
      })
    )
    const usage = events.find((e) => e.type === "done")?.response?.usage
    expect(usage?.inputTokens).toBe(10)
    expect(usage?.outputTokens).toBe(4)
  })

  it("asks for usage, which streaming omits unless requested", async () => {
    fetchFn.mockClear()
    await collect(
      streamOpenAICompatible(request, {
        baseUrl: "https://x",
        apiKey: "k",
        fetchFn: fetchFn as never,
      })
    )
    const init = fetchFn.mock.calls[0]?.[1]
    expect(init, "the stream was never requested").toBeTruthy()
    const body = JSON.parse(init!.body) as Record<string, unknown>
    expect(body.stream).toBe(true)
    expect(body.stream_options).toEqual({ include_usage: true })
  })
})

describe("collecting a stream", () => {
  function eventsOf(parts: string[], final?: string): AsyncIterable<AIStreamEvent> {
    return (async function* () {
      for (const p of parts) yield { type: "delta", delta: p } as AIStreamEvent
      yield {
        type: "done",
        response: {
          content: final ?? parts.join(""),
          usage: {
            inputTokens: 1,
            outputTokens: 1,
            totalTokens: 2,
            cachedInputTokens: null,
            reasoningTokens: null,
            rawUsage: {},
          },
          finishReason: "stop",
        },
      } as AIStreamEvent
    })()
  }

  it("reports the text so far as it grows", async () => {
    const seen: string[] = []
    let clock = 0
    await collectStream(
      eventsOf(["a", "b", "c"]),
      (partial) => seen.push(partial),
      10,
      () => (clock += 100)
    )
    // Each report is the whole text so far, not the newest fragment — the
    // reader is being shown a message, not a diff.
    expect(seen).toEqual(["a", "ab", "abc"])
  })

  it("throttles the writes instead of one per token", async () => {
    const seen: string[] = []
    // A clock that never advances: every delta lands inside the same window.
    await collectStream(
      eventsOf(["a", "b", "c", "d"]),
      (partial) => seen.push(partial),
      400,
      () => 0
    )
    expect(seen.length).toBeLessThan(4)
  })

  it("returns the provider's final content, not the accumulation", async () => {
    // They agree in every normal case. Where they disagree, the one the
    // provider called final is the answer.
    const result = await collectStream(
      eventsOf(["par", "tial"], "the whole thing"),
      () => {}
    )
    expect(result.content).toBe("the whole thing")
  })

  it("falls back to the accumulation if the final content is empty", async () => {
    const result = await collectStream(eventsOf(["a", "b"], ""), () => {})
    expect(result.content).toBe("ab")
  })

  it("fails loudly if the stream ends without a final response", async () => {
    const truncated = (async function* () {
      yield { type: "delta", delta: "a" } as AIStreamEvent
    })()
    await expect(collectStream(truncated, () => {})).rejects.toThrow(
      /without a final response/
    )
  })
})
