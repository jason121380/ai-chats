import { afterEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"

import UnlockPage from "@/app/unlock/page"
import { t } from "@/lib/i18n"

/**
 * Unlocking used to take two presses: the first appeared to do nothing.
 *
 * The screen navigated with the client router — a replace followed by a
 * refresh. The refresh refetches the CURRENT route, so landing after the
 * replace it put /unlock straight back on screen; the replace reads the
 * client router cache, which can still hold what the middleware returned for
 * that route before a cookie existed; and the cookie is set by the response
 * being read, so a navigation in the same tick races the browser committing
 * it. A full document load has none of these properties, which is why the
 * assertion here is on window.location and not on a router mock.
 */

const search = { value: "" }

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(search.value),
}))

function stubLocation() {
  const replace = vi.fn()
  Object.defineProperty(window, "location", {
    configurable: true,
    writable: true,
    value: { ...window.location, replace },
  })
  return replace
}

function stubFetch(status: number) {
  const calls: unknown[] = []
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      calls.push(JSON.parse(init.body as string))
      return {
        ok: status < 400,
        status,
        json: async () => ({}),
      } as Response
    })
  )
  return calls
}

async function unlockWith(secret: string) {
  fireEvent.change(screen.getByLabelText(t.unlock.label), {
    target: { value: secret },
  })
  fireEvent.click(screen.getByRole("button", { name: t.unlock.submit }))
}

afterEach(() => {
  vi.unstubAllGlobals()
  search.value = ""
})

describe("the unlock screen", () => {
  it("leaves for the app in one press, as a fresh document", async () => {
    stubFetch(200)
    const replace = stubLocation()
    render(<UnlockPage />)
    await unlockWith("s3cret")
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"))
    expect(replace).toHaveBeenCalledTimes(1)
  })

  it("returns to where the middleware turned them away from", async () => {
    search.value = "next=%2Fhistory%2Fabc%3Ftab%3D1"
    stubFetch(200)
    const replace = stubLocation()
    render(<UnlockPage />)
    await unlockWith("s3cret")
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith("/history/abc?tab=1")
    )
  })

  it("refuses to be bounced off-site by a crafted next", async () => {
    // The one moment a redirect is worth stealing: the person has just
    // proved they hold the secret, so a convincing copy of this screen on
    // another host would be handed it next.
    search.value = "next=%2F%2Fevil.example.com"
    stubFetch(200)
    const replace = stubLocation()
    render(<UnlockPage />)
    await unlockWith("s3cret")
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"))
  })

  it("says the secret was wrong and stays put", async () => {
    stubFetch(401)
    const replace = stubLocation()
    render(<UnlockPage />)
    await unlockWith("wrong")
    await waitFor(() => expect(screen.getByText(t.unlock.failed)).toBeTruthy())
    expect(replace).not.toHaveBeenCalled()
    // The button comes back, because there is something to try again with.
    expect(
      screen.getByRole("button", { name: t.unlock.submit })
    ).not.toHaveProperty("disabled", true)
  })
})
