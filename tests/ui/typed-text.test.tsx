import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, render } from "@testing-library/react"

import { useTypedText } from "@/components/council/use-typed-text"

/**
 * Pacing streamed text out into something that reads as typing.
 *
 * This is a display buffer over text that has already arrived, like the few
 * seconds a video player holds back. That is only defensible while two things
 * stay true, and both are tested here: it can never show a character the
 * model has not produced, and a finished message is never left looking
 * half-written.
 */

function Probe({ text, active }: { text: string; active: boolean }) {
  return <span data-testid="out">{useTypedText(text, active)}</span>
}

let shown: () => string

function mount(text: string, active: boolean) {
  const view = render(<Probe text={text} active={active} />)
  shown = () => view.getByTestId("out").textContent ?? ""
  return {
    rerender: (next: string, nextActive = active) =>
      view.rerender(<Probe text={next} active={nextActive} />),
  }
}

/** Advance the reveal by roughly `ms` of wall clock. */
function tick(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms)
  })
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe("revealing streamed text", () => {
  // A real turn is hundreds of characters; a ten-character fixture drains in
  // a few ticks and would prove nothing about pacing.
  const LONG = "越南美髮市場值得投資，但只值得選點、選客群、選模式地投資。".repeat(8)

  it("starts from nothing and fills in", () => {
    mount(LONG, true)
    expect(shown()).toBe("")
    tick(300)
    const partway = shown()
    expect(partway.length).toBeGreaterThan(0)
    expect(partway.length).toBeLessThan(LONG.length)
    expect(LONG.startsWith(partway)).toBe(true)
  })

  it("never shows a character that has not arrived", () => {
    const full = "越南美髮市場值得投資"
    mount(full.slice(0, 4), true)
    // Run far longer than it takes to drain, then check it did not invent
    // the rest of a sentence it has not been given.
    tick(5000)
    expect(shown()).toBe(full.slice(0, 4))
  })

  it("catches up when more text arrives", () => {
    const view = mount("越南", true)
    tick(2000)
    expect(shown()).toBe("越南")
    view.rerender("越南美髮市場值得投資")
    tick(2000)
    expect(shown()).toBe("越南美髮市場值得投資")
  })

  it("snaps to the whole message the moment the turn finishes", () => {
    const full = "越南美髮市場值得投資，但要選點、選客群、選模式。"
    const view = mount(full, true)
    tick(60)
    expect(shown().length).toBeLessThan(full.length)
    // The turn completing must not leave a half-written message on screen
    // waiting for an animation to catch up.
    view.rerender(full, false)
    expect(shown()).toBe(full)
  })

  it("shows a finished message immediately, with no reveal at all", () => {
    mount("已經寫完了", false)
    expect(shown()).toBe("已經寫完了")
  })

  it("restarts for a different message rather than continuing the last", () => {
    const view = mount("第一位講的話很長很長很長", true)
    tick(5000)
    expect(shown()).toBe("第一位講的話很長很長很長")
    // A new speaker's text is not an extension of the previous one.
    view.rerender("第二位")
    expect(shown()).toBe("")
    tick(2000)
    expect(shown()).toBe("第二位")
  })

  it("keeps moving rather than draining and stalling", () => {
    mount("一二三四五六七八九十一二三四五六七八九十", true)
    const a = shown().length
    tick(90)
    const b = shown().length
    tick(90)
    const c = shown().length
    expect(b).toBeGreaterThan(a)
    expect(c).toBeGreaterThan(b)
  })
})
