/**
 * Read a Server-Sent Events body as a sequence of `data:` payloads.
 *
 * Every streaming provider here speaks SSE, and all of them have the same
 * two hazards: a chunk boundary can fall in the middle of a line, and the
 * last line can arrive without its trailing newline. Both produce the same
 * failure — a JSON.parse on half an object — so the buffering lives in one
 * place rather than three.
 *
 * Yields the raw payload string. Sentinel values like OpenAI's `[DONE]` are
 * the caller's business, because they differ per vendor.
 */
export async function* readSseData(
  body: ReadableStream<Uint8Array>
): AsyncGenerator<string> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      let newline: number
      while ((newline = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, newline).trim()
        buffer = buffer.slice(newline + 1)
        if (line.startsWith("data:")) yield line.slice(5).trim()
      }
    }
    // A final line with no newline after it is still a line.
    const rest = buffer.trim()
    if (rest.startsWith("data:")) yield rest.slice(5).trim()
  } finally {
    reader.releaseLock()
  }
}

/** JSON.parse that skips a malformed chunk rather than ending the stream. */
export function parseSseJson<T>(payload: string): T | null {
  try {
    return JSON.parse(payload) as T
  } catch {
    return null
  }
}
