"use client"

import { useEffect, useMemo, useState } from "react"
import { Check, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { PRICE_CATALOG, type CatalogPrice } from "@/lib/price-catalog"
import { t } from "@/lib/i18n"
import { PROVIDER_LABELS, type PricingRowDto } from "@/types/api"

/**
 * Apply published list prices to the pricing table.
 *
 * It posts to /api/pricing like any other price change, which closes the
 * previous row and opens a new one — prices are never edited in place, so a
 * ModelRun's cost snapshot stays whatever it was at the time. This dialog is
 * a prefill for a form, not a second source of truth.
 */
export function ApplyPricesDialog({
  open,
  onClose,
  onApplied,
  rows,
}: {
  open: boolean
  onClose: () => void
  onApplied: () => void
  /** Current pricing rows, so an unchanged rate is not rewritten. */
  rows: PricingRowDto[]
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose()
    }
    document.addEventListener("keydown", onKey)
    document.body.style.overflow = "hidden"
    return () => {
      document.removeEventListener("keydown", onKey)
      document.body.style.overflow = ""
    }
  }, [open, busy, onClose])

  const active = useMemo(() => {
    const now = Date.now()
    const map = new Map<string, PricingRowDto>()
    for (const row of rows) {
      const from = new Date(row.effectiveFrom).getTime()
      const to = row.effectiveTo ? new Date(row.effectiveTo).getTime() : null
      if (from <= now && (to === null || to > now)) {
        map.set(`${row.provider}/${row.modelId}`, row)
      }
    }
    return map
  }, [rows])

  const same = (price: CatalogPrice) => {
    const current = active.get(`${price.provider}/${price.modelId}`)
    if (!current) return false
    return (
      Number(current.inputPerMillion) === Number(price.inputPerMillion) &&
      Number(current.outputPerMillion) === Number(price.outputPerMillion)
    )
  }

  const pending = PRICE_CATALOG.filter((p) => !same(p))

  if (!open) return null

  const apply = async () => {
    setBusy(true)
    setError(null)
    try {
      for (const price of pending) {
        const res = await fetch("/api/pricing", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider: price.provider,
            modelId: price.modelId,
            inputPerMillion: price.inputPerMillion,
            outputPerMillion: price.outputPerMillion,
            cachedInputPerMillion: price.cachedInputPerMillion ?? null,
            source: price.source,
          }),
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error ?? t.errors.requestFailed)
        }
      }
      onApplied()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 py-10"
      onClick={() => {
        if (!busy) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t.settings.applyPrices}
        className="w-full max-w-2xl rounded-lg border border-gray-200 bg-white p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">
              {t.settings.applyPrices}
            </h2>
            <p className="mt-1 text-sm text-gray-400">
              {t.settings.applyPricesHint}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="關閉"
            className="shrink-0 text-gray-400 transition-colors hover:text-gray-700"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-1.5">
          {PRICE_CATALOG.map((price) => {
            const unchanged = same(price)
            return (
              <div
                key={`${price.provider}/${price.modelId}`}
                className="rounded-lg border border-gray-200 px-3 py-2"
              >
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-sm font-semibold text-gray-900">
                    {price.displayName}
                  </span>
                  <span className="text-xs text-gray-400">
                    {PROVIDER_LABELS[price.provider] ?? price.provider}
                  </span>
                  <span className="ml-auto text-sm tabular-nums text-gray-600">
                    ${price.inputPerMillion} / ${price.outputPerMillion}
                    <span className="ml-1 text-xs text-gray-400">
                      {t.settings.perMillion}
                    </span>
                  </span>
                  {unchanged && (
                    <Check size={14} className="shrink-0 text-emerald-600" />
                  )}
                </div>
                <div className="mt-0.5 text-xs text-gray-400">
                  {price.modelId} · {price.source}
                </div>
                {price.note && (
                  <div className="mt-1 text-xs text-amber-700">
                    {price.note}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {error && <p className="mt-4 text-sm text-red-500">{error}</p>}

        <div className="mt-6 flex items-center justify-end gap-2">
          <span className="mr-auto text-xs text-gray-400">
            {t.settings.applyPricesCount(pending.length)}
          </span>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            {t.settings.cancel}
          </Button>
          <Button onClick={apply} disabled={busy || pending.length === 0}>
            {busy ? t.settings.applying : t.settings.applyPrices}
          </Button>
        </div>
      </div>
    </div>
  )
}
