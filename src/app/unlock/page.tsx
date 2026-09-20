"use client"

import { useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
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
  const router = useRouter()
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
        return
      }
      if (!res.ok) {
        setError(t.unlock.unavailable)
        return
      }
      // Only ever a path on this origin. `next` arrives in the URL, so a
      // crafted link could otherwise bounce someone to another site at the
      // exact moment they authenticate.
      const next = params?.get("next")
      const target =
        next && next.startsWith("/") && !next.startsWith("//") ? next : "/"
      router.replace(target)
      router.refresh()
    } catch {
      setError(t.unlock.unavailable)
    } finally {
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
