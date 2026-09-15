import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"

import { DiscussionComposer } from "@/components/council/discussion-composer"

/**
 * The composer has to be reachable without scrolling for it.
 *
 * Sitting at the bottom of the chat card is not the same thing: on a short
 * screen the card's own bottom edge starts below the fold, and a chat box you
 * have to go looking for is not a chat box. Measured at 1280×560 before this
 * was fixed, it started 20px below the viewport.
 */

const CHAT_PAGES = [
  join(__dirname, "..", "..", "src", "app", "history", "[id]", "page.tsx"),
  join(__dirname, "..", "..", "src", "app", "council", "page.tsx"),
]

describe("the composer stays on screen", () => {
  it("is sticky to the bottom of the viewport", () => {
    const { container } = render(
      <DiscussionComposer runId="r1" finished={false} onSent={() => {}} />
    )
    const composer = container.firstElementChild
    expect(composer?.className).toContain("sticky")
    expect(composer?.className).toContain("bottom-0")
  })

  it("sits above the transcript rather than under it", () => {
    const { container } = render(
      <DiscussionComposer runId="r1" finished={false} onSent={() => {}} />
    )
    // Without a stacking order it sticks, and the messages scroll over it.
    expect(container.firstElementChild?.className).toContain("z-10")
  })

  it("renders its own background, so text does not show through", () => {
    const { container } = render(
      <DiscussionComposer runId="r1" finished={false} onSent={() => {}} />
    )
    expect(container.firstElementChild?.className).toContain("bg-white")
    expect(screen.getByRole("textbox")).toBeTruthy()
  })

  /**
   * The trap that cost the most to find: `overflow-hidden` on an ancestor
   * turns `position: sticky` into a no-op. Nothing warns, nothing logs, the
   * corners just look tidy and the composer quietly stops sticking. It is a
   * natural thing to add back to a rounded card.
   */
  for (const page of CHAT_PAGES) {
    it(`does not wrap the chat card in overflow-hidden (${page.split("/").slice(-2).join("/")})`, () => {
      const source = readFileSync(page, "utf8")
      const lines = source.split("\n")
      const transcriptAt = lines.findIndex((l) => l.includes("<ChatTranscript"))
      expect(transcriptAt).toBeGreaterThan(-1)
      // The card is the wrapper a few lines above the transcript.
      const card = lines.slice(Math.max(0, transcriptAt - 6), transcriptAt)
      // Only a real className counts. The comment above the card says the
      // word too, and a guard that trips on its own explanation teaches the
      // next person to delete the guard.
      const offending = card.filter((l) =>
        /className="[^"]*\boverflow-hidden\b/.test(l)
      )
      expect(offending).toEqual([])
    })
  }

  it("leaves room under the last message for the composer to cover", () => {
    for (const page of CHAT_PAGES) {
      const source = readFileSync(page, "utf8")
      const scroller = source
        .split("\n")
        .find((l) => l.includes("overflow-y-auto") && l.includes("max-h-"))
      expect(scroller, `no transcript scroller found in ${page}`).toBeTruthy()
      // Otherwise the sticky composer covers the newest message, which is the
      // one the reader came for.
      expect(scroller).toMatch(/\bpb-\d+/)
    }
  })
})
