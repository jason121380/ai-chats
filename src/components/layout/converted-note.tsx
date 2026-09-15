"use client"

import { useMoney } from "@/components/layout/currency-context"
import { formatDate, t } from "@/lib/i18n"

/**
 * One line, wherever totals are read, saying that the figures above it were
 * converted and at what rate.
 *
 * A converted amount looks exactly like a measured one. On a page whose whole
 * purpose is "what did this cost", the reader has to be able to tell — and to
 * see the rate, because the difference between a good rate and a month-old
 * one is a few percent of every number on the screen.
 *
 * Renders nothing when no rate is set, because then nothing was converted.
 */
export function ConvertedNote({ className }: { className?: string }) {
  const money = useMoney()
  if (!money.converted || !money.rate) return null
  return (
    <p className={className ?? "text-xs text-gray-400"}>
      {t.settings.convertedNote(
        money.rate,
        money.updatedAt ? formatDate(money.updatedAt) : "—"
      )}
    </p>
  )
}
