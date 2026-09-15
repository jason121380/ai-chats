"use client"

import { useState } from "react"

import { Button } from "@/components/ui/button"
import { useMoney } from "@/components/layout/currency-context"
import { formatDate, t } from "@/lib/i18n"

/** Days since an ISO timestamp, floored. */
export function daysSince(iso: string, now: Date = new Date()): number {
  const ms = now.getTime() - new Date(iso).getTime()
  return Math.max(0, Math.floor(ms / 86_400_000))
}

/** Past this, the rate is shown with a warning instead of silently. */
export const RATE_STALE_DAYS = 30

/**
 * Set the rate used to show costs in New Taiwan dollars.
 *
 * Nothing here guesses. There is no default rate and no background refresh:
 * an exchange rate this app invented would look exactly like one it had
 * checked, and would be wrong by a little more every day with nothing on
 * screen to say so. Leaving it unset shows US$, which is what the amounts
 * genuinely are.
 *
 * Saving reloads the page. The rate is read on the server in the root layout
 * so amounts never flash the wrong currency, and a reload is the honest way
 * to pick up a value that was rendered there.
 */
export function CurrencySetting() {
  const money = useMoney()
  const [value, setValue] = useState(money.rate ?? "")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const age = money.updatedAt ? daysSince(money.updatedAt) : null
  const stale = age !== null && age >= RATE_STALE_DAYS

  const save = async () => {
    const rate = value.trim()
    if (!/^\d+(\.\d+)?$/.test(rate) || Number(rate) <= 0) {
      setError(t.settings.rateInvalid)
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await fetch("/api/settings/currency", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usdToTwd: rate }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? t.errors.requestFailed)
      window.location.reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  const clear = async () => {
    setBusy(true)
    setError(null)
    try {
      await fetch("/api/settings/currency", { method: "DELETE" })
      window.location.reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-gray-900">
        {t.settings.currency}
      </h3>
      <p className="mt-1 text-xs text-gray-400">{t.settings.currencyHint}</p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-sm text-gray-600">{t.settings.rateLabel}</span>
        <input
          type="text"
          inputMode="decimal"
          value={value}
          disabled={busy}
          onChange={(e) => setValue(e.target.value)}
          placeholder={t.settings.ratePlaceholder}
          aria-label={t.settings.rateLabel}
          className="h-9 w-28 rounded-lg border border-gray-200 px-3 text-sm tabular-nums outline-none focus:border-rose-brand"
        />
        <span className="text-sm text-gray-600">{t.settings.rateUnit}</span>
        <Button onClick={save} disabled={busy}>
          {busy ? t.settings.rateSaving : t.settings.rateSave}
        </Button>
        {money.converted && (
          <Button variant="outline" onClick={clear} disabled={busy}>
            {t.settings.rateClear}
          </Button>
        )}
      </div>

      <p className="mt-2 text-xs text-gray-400">{t.settings.rateSourceNote}</p>

      {!money.converted && (
        <p className="mt-2 text-xs text-gray-500">{t.settings.rateUnset}</p>
      )}
      {money.updatedAt && (
        <p
          className={
            stale ? "mt-2 text-xs text-amber-700" : "mt-2 text-xs text-gray-500"
          }
        >
          {t.settings.rateSetAt(formatDate(money.updatedAt))}
          {stale && age !== null && ` — ${t.settings.rateStale(age)}`}
        </p>
      )}
      {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
    </div>
  )
}
