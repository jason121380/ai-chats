import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

/**
 * A polling page must never have two of its own reads in flight at once.
 *
 * `setInterval` fires on a schedule, not on completion. When a fetch takes
 * longer than the interval — which is exactly what happens on a slow
 * connection, the case where it hurts — the ticks stack: several identical
 * requests for the same session, each re-reading the whole thing, all queued
 * behind each other on one connection. The page gets slower the slower it
 * already was, and the server does the work several times over.
 *
 * Both chat pages poll every second, so both need the guard.
 */

const POLLING_PAGES = [
  join(__dirname, "..", "..", "src", "app", "history", "[id]", "page.tsx"),
  join(__dirname, "..", "..", "src", "app", "council", "page.tsx"),
]

describe("polling pages", () => {
  for (const page of POLLING_PAGES) {
    const name = page.split("/").slice(-2).join("/")
    const source = readFileSync(page, "utf8")

    it(`${name} polls on an interval at all`, () => {
      // Guards the guard: if the poll were removed or renamed, the
      // assertions below would pass by describing nothing.
      expect(source).toMatch(/setInterval\(/)
    })

    it(`${name} refuses to start a second read while one is running`, () => {
      expect(source).toContain("inFlight")
      // A ref, not state: a re-render must not reset it, and setting it must
      // not schedule a render in the middle of a fetch.
      expect(source).toMatch(/const inFlight = useRef\(false\)/)
      expect(source).toMatch(/if \(inFlight\.current\) return/)
      // Released on failure too, or one rejected fetch wedges the page shut.
      expect(source).toMatch(/finally \{\s*inFlight\.current = false/)
    })

    it(`${name} stops polling while the page is hidden`, () => {
      // Inside the interval callback specifically. Both pages also mention
      // document.hidden in a visibilitychange listener, so a bare "does the
      // file say it" check is satisfied by the wrong occurrence.
      const lines = source.split("\n")
      const tickAt = lines.findIndex((l) => l.includes("setInterval("))
      expect(tickAt).toBeGreaterThan(-1)
      const body = lines.slice(tickAt, tickAt + 8).join("\n")
      expect(body).toMatch(/if \(document\.hidden\) return/)
    })
  }
})
