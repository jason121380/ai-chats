import { afterEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"

import { AppChrome } from "@/components/layout/app-chrome"
import { SignOutButton } from "@/components/layout/sign-out-button"
import { t } from "@/lib/i18n"

/**
 * The unlock screen is the one page reachable without the secret, and it was
 * rendering inside the full shell: a menu of five destinations, every one of
 * which bounces straight back to it. And there was a way in with no way back
 * — the cookie lasts thirty days, so a browser once unlocked stayed unlocked.
 */

const path = { value: "/" }

vi.mock("next/navigation", () => ({
  usePathname: () => path.value,
}))

afterEach(() => {
  vi.unstubAllGlobals()
  path.value = "/"
})

describe("the app chrome", () => {
  it("gives the unlock screen no menu and no header", () => {
    path.value = "/unlock"
    render(
      <AppChrome>
        <p>要輸入密鑰</p>
      </AppChrome>
    )
    expect(screen.getByText("要輸入密鑰")).toBeTruthy()
    expect(screen.queryByText("主選單")).toBeNull()
    expect(screen.queryByLabelText(t.unlock.signOut)).toBeNull()
  })

  it("gives every other page the menu", () => {
    path.value = "/council"
    render(
      <AppChrome>
        <p>議會</p>
      </AppChrome>
    )
    expect(screen.getByText("主選單")).toBeTruthy()
    expect(screen.getByText(t.nav.history)).toBeTruthy()
  })
})

describe("signing out", () => {
  function stubLocation() {
    const replace = vi.fn()
    Object.defineProperty(window, "location", {
      configurable: true,
      writable: true,
      value: { ...window.location, replace },
    })
    return replace
  }

  it("drops the cookie and reloads onto the unlock screen", async () => {
    const calls: Array<[string, string | undefined]> = []
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push([url, init.method])
        return { ok: true, status: 200, json: async () => ({}) } as Response
      })
    )
    const replace = stubLocation()

    render(<SignOutButton />)
    fireEvent.click(screen.getByLabelText(t.unlock.signOut))

    await waitFor(() =>
      expect(calls).toEqual([["/api/auth/unlock", "DELETE"]])
    )
    // A document load, not a client navigation: the cookie just changed
    // underneath the router, whose cache predates the change.
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/unlock"))
  })

  it("still leaves when the request itself fails", async () => {
    // The next guarded page redirects here anyway; reporting a failure
    // nobody can act on would only strand them on a page they asked to
    // leave.
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new TypeError("fetch failed")
    }))
    const replace = stubLocation()

    render(<SignOutButton />)
    fireEvent.click(screen.getByLabelText(t.unlock.signOut))
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/unlock"))
  })
})
