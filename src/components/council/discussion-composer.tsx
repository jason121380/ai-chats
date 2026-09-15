"use client"

import { useState } from "react"
import { Loader2, Send } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { t } from "@/lib/i18n"

/**
 * The composer at the bottom of the discussion chat window.
 *
 * Two things can happen when it is used, and which one is not a mode the
 * person picks — it follows from whether the meeting is still sitting:
 *
 *   running  → /say stores the message and the loop reads it between turns.
 *              The delay is deliberate and the placeholder says so: someone
 *              typing mid-turn should expect the speaker to finish.
 *   finished → /continue puts the participants back in the room for another
 *              round with the message already at the head of it.
 *
 * `canContinue` is false for a council run, which has no round to add.
 */
export function DiscussionComposer({
  runId,
  finished,
  canContinue = false,
  onSent,
  className,
}: {
  runId: string
  /** The meeting has ended — sending restarts it rather than joining it. */
  finished: boolean
  canContinue?: boolean
  onSent: () => void
  /** Overrides the chrome — a page that is not a card wants no card edges. */
  className?: string
}) {
  const [value, setValue] = useState("")
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const continuing = finished && canContinue
  const disabled = finished && !canContinue

  const send = async () => {
    const content = value.trim()
    if (!content || sending || disabled) return
    setSending(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/council/${runId}/${continuing ? "continue" : "say"}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content }),
        }
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? t.errors.requestFailed)
      setValue("")
      onSent()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSending(false)
    }
  }

  return (
    // Sticky to the bottom of the viewport, not merely the bottom of the card.
    // On a short screen the card's own bottom edge starts below the fold, so a
    // composer that only sat there would have to be scrolled to — and a chat
    // box you have to go looking for is not a chat box. The transcript above
    // carries matching bottom padding so its last message can always be
    // scrolled clear of this.
    <div
      className={cn(
        "sticky bottom-0 z-10 rounded-b-lg border-t border-gray-100 bg-white p-3",
        className
      )}
    >
      <div className="flex items-end gap-2">
        <Textarea
          rows={1}
          className="min-h-[42px] flex-1"
          placeholder={
            disabled
              ? t.discussion.composerClosed
              : continuing
                ? t.discussion.composerContinue
                : t.discussion.composerHint
          }
          value={value}
          disabled={disabled || sending}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              void send()
            }
          }}
        />
        <Button
          size="icon"
          onClick={send}
          disabled={disabled || sending || !value.trim()}
          aria-label={continuing ? t.discussion.resume : t.discussion.join}
        >
          {sending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </div>
      {continuing && !error && (
        <p className="mt-2 text-xs text-gray-400">
          {t.discussion.continueHint}
        </p>
      )}
      {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
    </div>
  )
}
