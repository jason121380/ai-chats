import { afterEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"

import { DiscussionComposer } from "@/components/council/discussion-composer"
import { t } from "@/lib/i18n"

/**
 * Which endpoint the composer posts to is decided by the state of the
 * meeting, not by the person. Getting it backwards fails quietly in the
 * direction that matters: /say on a finished run answers 409 "已經結束了",
 * which reads like the feature was never built.
 */

function stubFetch() {
  const calls: string[] = []
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      calls.push(url)
      return { ok: true, json: async () => ({ id: "m1" }) } as Response
    })
  )
  return calls
}

async function type(text: string) {
  const box = screen.getByRole("textbox")
  fireEvent.change(box, { target: { value: text } })
  return box
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("the discussion composer", () => {
  it("says into a meeting that is still sitting", async () => {
    const calls = stubFetch()
    render(
      <DiscussionComposer runId="r1" finished={false} canContinue onSent={() => {}} />
    )
    await type("等一下")
    fireEvent.click(screen.getByLabelText(t.discussion.join))
    await waitFor(() => expect(calls).toEqual(["/api/council/r1/say"]))
  })

  it("reopens a meeting that has ended", async () => {
    const calls = stubFetch()
    render(
      <DiscussionComposer runId="r1" finished canContinue onSent={() => {}} />
    )
    await type("再想一下這件事")
    fireEvent.click(screen.getByLabelText(t.discussion.resume))
    await waitFor(() => expect(calls).toEqual(["/api/council/r1/continue"]))
  })

  it("says the meeting is closed where it cannot be reopened", async () => {
    const calls = stubFetch()
    render(
      <DiscussionComposer
        runId="r1"
        finished
        canContinue={false}
        onSent={() => {}}
      />
    )
    const box = screen.getByRole("textbox")
    expect(box).toBeDisabled()
    expect(box.getAttribute("placeholder")).toBe(t.discussion.composerClosed)
    fireEvent.click(screen.getByLabelText(t.discussion.join))
    expect(calls).toEqual([])
  })

  it("warns that sending restarts the meeting, before it is sent", () => {
    stubFetch()
    render(
      <DiscussionComposer runId="r1" finished canContinue onSent={() => {}} />
    )
    expect(screen.getByText(t.discussion.continueHint)).toBeTruthy()
  })

  // The shortcut, not the button: the button is disabled on an empty box,
  // so clicking it proves nothing about the guard inside send(). ⌘+Enter
  // reaches send() directly.
  it("does not send a message that is only whitespace", async () => {
    const calls = stubFetch()
    render(
      <DiscussionComposer runId="r1" finished canContinue onSent={() => {}} />
    )
    const box = await type("   ")
    fireEvent.keyDown(box, { key: "Enter", metaKey: true })
    expect(calls).toEqual([])
  })

  it("sends on ⌘+Enter and on Ctrl+Enter", async () => {
    const calls = stubFetch()
    render(
      <DiscussionComposer runId="r1" finished canContinue onSent={() => {}} />
    )
    const box = await type("再想一下")
    fireEvent.keyDown(box, { key: "Enter", metaKey: true })
    await waitFor(() => expect(calls).toEqual(["/api/council/r1/continue"]))
    await type("再想一下")
    fireEvent.keyDown(box, { key: "Enter", ctrlKey: true })
    await waitFor(() => expect(calls).toHaveLength(2))
  })

  // A question is often several lines of thought, and a send fired by the
  // key that ends a line was going off half-written.
  it("plain Enter writes a newline instead of sending", async () => {
    const calls = stubFetch()
    render(
      <DiscussionComposer runId="r1" finished canContinue onSent={() => {}} />
    )
    const box = await type("第一行")
    const event = fireEvent.keyDown(box, { key: "Enter" })
    // Not prevented: the textarea keeps its default, which is the newline.
    expect(event).toBe(true)
    expect(calls).toEqual([])
  })
})
