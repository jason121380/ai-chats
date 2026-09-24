"use client"

import { useState } from "react"
import { useSearchParams } from "next/navigation"
import { KeyRound, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { t } from "@/lib/i18n"

/**
 * The way in.
 *
 * Deliberately the plainest screen in the app: one field, one button, no
 * navigation. It is reachable without credentials, so it gives nothing away —
 * no hint about the shape of the secret, and nothing about what is behind it.
 */
export default function UnlockPage() {
  const params = useSearchParams()
  const [secret, setSecret] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!secret.trim() || busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch("/api/auth/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret }),
      })
      if (res.status === 401) {
        setError(t.unlock.failed)
        setBusy(false)
        return
      }
      if (!res.ok) {
        setError(t.unlock.unavailable)
        setBusy(false)
        return
      }
      // Only ever a path on this origin. `next` arrives in the URL, so a
      // crafted link could otherwise bounce someone to another site at the
      // exact moment they authenticate.
      const next = params?.get("next")
      const target =
        next && next.startsWith("/") && !next.startsWith("//") ? next : "/"

      // A full document load, not the client router.
      //
      // This screen used to call router.replace() and then router.refresh(),
      // and unlocking took two attempts: the first press appeared to do
      // nothing. Three things can each produce that, and the client router is
      // involved in all three. The refresh refetches the CURRENT route, so
      // when it lands after the replace it puts /unlock back on screen. The
      // replace consults the client router cache, which may hold the payload
      // the middleware returned for this route before there was a cookie.
      // And the cookie is set by the response above, so a navigation started
      // in the same tick is racing the browser's own commit of it.
      //
      // Leaving the client router behind removes all three at once, and a
      // fresh document is what you want at this boundary anyway: the app is
      // about to render as an authenticated person for the first time, with
      // no state from the locked screen worth carrying across.
      // `busy` deliberately stays set from here: the document is on its way
      // out, and putting the button back would offer a second submit during
      // a load that is already taking the person where they asked to go.
      window.location.replace(target)
    } catch {
      setError(t.unlock.unavailable)
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-sm flex-col justify-center">
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <div className="mb-1 flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-rose-brand" />
          <h1 className="text-base font-semibold text-gray-900">
            {t.unlock.title}
          </h1>
        </div>
        <p className="mb-5 text-sm text-gray-400">
          {t.unlock.subtitle}
        </p>

        <form onSubmit={submit} className="space-y-3">
          <label
            htmlFor="app-secret"
            className="block text-xs font-medium text-gray-500"
          >
            {t.unlock.label}
          </label>
          <input
            id="app-secret"
            type="password"
            autoComplete="current-password"
            value={secret}
            disabled={busy}
            onChange={(e) => setSecret(e.target.value)}
            placeholder={t.unlock.placeholder}
            className="h-10 w-full rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-rose-brand"
          />
          <Button
            type="submit"
            disabled={busy || !secret.trim()}
            className="w-full"
          >
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {t.unlock.submitting}
              </>
            ) : (
              t.unlock.submit
            )}
          </Button>
          {error && <p className="text-sm text-red-500">{error}</p>}
        </form>
      </div>
    </div>
  )
}
