"use client"

import { useState } from "react"
import { Send } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { t } from "@/lib/i18n"

/**
 * The composer at the bottom of the discussion chat window.
 *
 * Sending only stores the message; the discussion loop reads it between turns.
 * That delay is deliberate and the placeholder says so — a person who types
 * mid-turn should expect the current speaker to finish, not be cut off.
 */
export function DiscussionComposer({
  runId,
  disabled,
  onSent,
}: {
  runId: string
  /** The meeting is over — nobody is left to read a new message. */
  disabled: boolean
  onSent: () => void
}) {
  const [value, setValue] = useState("")
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const send = async () => {
    const content = value.trim()
    if (!content || sending) return
    setSending(true)
    setError(null)
    try {
      const res = await fetch(`/api/council/${runId}/say`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      })
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
    <div className="border-t border-gray-100 bg-white p-3">
      <div className="flex items-end gap-2">
        <Textarea
          rows={1}
          className="min-h-[42px] flex-1"
          placeholder={
            disabled ? t.discussion.composerClosed : t.discussion.composerHint
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
          aria-label={t.discussion.join}
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
      {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
    </div>
  )
}
