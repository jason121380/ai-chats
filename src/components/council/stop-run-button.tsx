"use client"

import { useState } from "react"
import { Loader2, Square } from "lucide-react"

import { Button } from "@/components/ui/button"
import { t } from "@/lib/i18n"

/**
 * End a discussion that is not going to finish on its own.
 *
 * Execution is in-process, so a container restart leaves a meeting sitting in
 * a non-terminal state with nothing driving it. It clears itself only after
 * the staleness window, and until then the composer is in "still running"
 * mode: anything typed is filed as an interjection nobody will ever read.
 * This is the way out of that fifteen minutes.
 */
export function StopRunButton({
  runId,
  onStopped,
}: {
  runId: string
  onStopped: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const stop = async () => {
    if (!window.confirm(t.council.stopConfirm)) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/council/${runId}/stop`, { method: "POST" })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? t.council.stopFailed)
      }
      onStopped()
    } catch (err) {
      setError(err instanceof Error ? err.message : t.council.stopFailed)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={stop} disabled={busy}>
        {busy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Square className="h-3.5 w-3.5" />
        )}
        {busy ? t.council.stopping : t.council.stop}
      </Button>
      {error && <span className="text-sm text-destructive">{error}</span>}
    </>
  )
}
