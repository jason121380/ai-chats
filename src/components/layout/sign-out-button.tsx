"use client"

import { useState } from "react"
import { LogOut } from "lucide-react"

import { t } from "@/lib/i18n"

/**
 * The way out.
 *
 * There was a way in and no way back: the cookie lasts thirty days, so once
 * a browser was unlocked it stayed unlocked, with no way to hand a borrowed
 * laptop back or to check the door still works.
 *
 * No confirmation. Signing out costs one paste of a secret the person
 * already holds, and a dialog guarding something that cheap is friction
 * without a purpose. The label hides below `sm` so the header band stays
 * readable on a phone; the icon keeps its accessible name either way.
 */
export function SignOutButton() {
  const [busy, setBusy] = useState(false)

  const signOut = async () => {
    setBusy(true)
    try {
      await fetch("/api/auth/unlock", { method: "DELETE" })
    } catch {
      // Whatever happened to the request, the next guarded page is a
      // redirect back here — so go there rather than report a failure
      // nobody can act on.
    }
    // A full document load, for the same reason as the unlock screen: the
    // cookie has just changed underneath the client router, and its cache
    // would happily hand back a page rendered while it still existed.
    window.location.replace("/unlock")
  }

  return (
    <button
      type="button"
      onClick={signOut}
      disabled={busy}
      aria-label={t.unlock.signOut}
      className="ml-3 flex flex-shrink-0 items-center gap-1.5 text-sm text-gray-400 transition-colors hover:text-gray-700 disabled:opacity-60"
    >
      <LogOut size={16} />
      <span className="hidden sm:inline">
        {busy ? t.unlock.signingOut : t.unlock.signOut}
      </span>
    </button>
  )
}
