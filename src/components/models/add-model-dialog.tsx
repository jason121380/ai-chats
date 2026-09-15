"use client"

import { useEffect, useState } from "react"
import { Check, Plus, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { catalogFor, type CatalogModel } from "@/lib/model-catalog"
import { cn } from "@/lib/utils"
import { t } from "@/lib/i18n"
import { PROVIDER_LABELS, ROLE_LABELS } from "@/types/api"

const PROVIDERS = ["OPENAI", "ANTHROPIC", "GOOGLE", "XAI"] as const
type Provider = (typeof PROVIDERS)[number]

/**
 * Add a model to 設定. A curated list of each provider's current models, plus
 * a free-text ID field.
 *
 * The free-text field is not a power-user afterthought — it is what keeps a
 * stale catalog from becoming a dead end. This project has already shipped a
 * model ID that the provider retired; when that happens next, the operator
 * needs to be able to type the replacement without waiting for a deploy.
 *
 * Hand-built rather than a Dialog dependency, matching designer_web: Esc and
 * backdrop close it, background scroll is locked while it is open.
 */
export function AddModelDialog({
  open,
  onClose,
  onAdded,
  existingKeys,
}: {
  open: boolean
  onClose: () => void
  onAdded: () => void
  /** `${provider}/${modelId}` for every row already configured. */
  existingKeys: Set<string>
}) {
  const [provider, setProvider] = useState<Provider>("OPENAI")
  const [modelId, setModelId] = useState("")
  const [displayName, setDisplayName] = useState("")
  const [role, setRole] = useState<string>("GENERAL")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) onClose()
    }
    document.addEventListener("keydown", onKey)
    document.body.style.overflow = "hidden"
    return () => {
      document.removeEventListener("keydown", onKey)
      document.body.style.overflow = ""
    }
  }, [open, saving, onClose])

  // Reset on open so a previous attempt never leaks into the next one.
  useEffect(() => {
    if (open) {
      setProvider("OPENAI")
      setModelId("")
      setDisplayName("")
      setRole("GENERAL")
      setError(null)
    }
  }, [open])

  if (!open) return null

  const pick = (m: CatalogModel) => {
    setModelId(m.modelId)
    setDisplayName(m.displayName)
    setError(null)
  }

  const submit = async () => {
    const id = modelId.trim()
    if (!id) {
      setError(t.settings.addErrorNoId)
      return
    }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch("/api/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          modelId: id,
          displayName: displayName.trim() || id,
          defaultRole: role,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? t.errors.requestFailed)
      onAdded()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  const catalog = catalogFor(provider)

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 py-10"
      onClick={() => {
        if (!saving) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t.settings.addModel}
        className="w-full max-w-lg rounded-lg border border-gray-200 bg-white p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">
              {t.settings.addModel}
            </h2>
            <p className="mt-1 text-sm text-gray-400">
              {t.settings.addModelHint}
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

        <div className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-gray-500">
              {t.settings.colProvider}
            </span>
            <Select
              value={provider}
              onValueChange={(v) => {
                setProvider(v as Provider)
                setModelId("")
                setDisplayName("")
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROVIDERS.map((p) => (
                  <SelectItem key={p} value={p}>
                    {PROVIDER_LABELS[p] ?? p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>

          <div>
            <span className="mb-1.5 block text-xs font-medium text-gray-500">
              {t.settings.recentModels}
            </span>
            <div className="space-y-1.5">
              {catalog.map((m) => {
                const already = existingKeys.has(`${m.provider}/${m.modelId}`)
                const selected = modelId === m.modelId
                return (
                  <button
                    key={m.modelId}
                    type="button"
                    onClick={() => pick(m)}
                    className={cn(
                      "flex w-full items-start gap-3 rounded-lg border px-3 py-2 text-left transition-colors",
                      selected
                        ? "border-rose-brand bg-rose-light/40"
                        : "border-gray-200 bg-white hover:border-rose-brand"
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-x-2">
                        <span
                          className={cn(
                            "text-sm font-semibold",
                            selected ? "text-rose-dark" : "text-gray-900"
                          )}
                        >
                          {m.displayName}
                        </span>
                        <span className="text-xs text-gray-400">
                          {m.released}
                        </span>
                        {already && (
                          <span className="text-xs text-gray-400">
                            · {t.settings.alreadyAdded}
                          </span>
                        )}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-gray-400">
                        {m.modelId} · {m.note}
                      </span>
                    </span>
                    {selected && (
                      <Check size={16} className="mt-0.5 shrink-0 text-rose-brand" />
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-gray-500">
              {t.settings.modelIdLabel}
            </span>
            <Input
              value={modelId}
              onChange={(e) => setModelId(e.target.value)}
              placeholder={t.settings.modelIdPlaceholder}
            />
            <span className="mt-1.5 block text-xs text-gray-400">
              {t.settings.modelIdHint}
            </span>
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-gray-500">
                {t.settings.displayNameLabel}
              </span>
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder={modelId || "—"}
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-gray-500">
                {t.settings.colRole}
              </span>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(ROLE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            {t.settings.cancel}
          </Button>
          <Button onClick={submit} disabled={saving}>
            <Plus size={15} />
            {saving ? t.settings.adding : t.settings.addModel}
          </Button>
        </div>
      </div>
    </div>
  )
}
