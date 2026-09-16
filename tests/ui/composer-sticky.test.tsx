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

const CHAT_PAGES: readonly string[] = [
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

  /**
   * The two pages reach "composer at the bottom" differently, and each way
   * has its own thing that must hold.
   *
   * /council is a card inside a scrolling page: its transcript is capped with
   * max-h and the composer sticks over it, so the transcript needs bottom
   * padding or the newest message — the one the reader came for — ends up
   * underneath it.
   */
  it("council: leaves room under the last message for the composer to cover", () => {
    const source = readFileSync(CHAT_PAGES[1] as string, "utf8")
    const scroller = source
      .split("\n")
      .find((l) => l.includes("overflow-y-auto") && l.includes("max-h-"))
    expect(scroller, "no capped transcript scroller on /council").toBeTruthy()
    expect(scroller).toMatch(/\bpb-\d+/)
  })

  /**
   * /history/[id] is a chat screen: it is exactly the height left under the
   * app header, so the window never scrolls and the composer is a sibling of
   * the transcript rather than something floating over it.
   *
   * `min-h-0` is the load-bearing part and the easiest to drop: without it a
   * flex child refuses to shrink below its content, the transcript grows to
   * its full height, and the whole page scrolls again — putting the composer
   * back off the bottom of the screen, which is the exact complaint this
   * layout answers.
   */
  it("history: the transcript is the only thing that scrolls", () => {
    const source = readFileSync(CHAT_PAGES[0] as string, "utf8")
    // The height is a named class in globals.css rather than an inline
    // calc, because it needs a `vh` fallback line underneath the `dvh` one —
    // see .h-chat-screen there.
    expect(source).toContain("h-chat-screen")
    const scroller = source
      .split("\n")
      .find((l) => l.includes("overflow-y-auto") && l.includes("flex-1"))
    expect(scroller, "no flex transcript scroller on /history/[id]").toBeTruthy()
    expect(scroller).toContain("min-h-0")
  })
})
