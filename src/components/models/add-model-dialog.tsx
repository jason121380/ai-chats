"use client"

import { useEffect, useMemo, useState } from "react"
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
import {
  PROVIDER_LABELS,
  ROLE_LABELS,
  type OpenRouterCatalogModelDto,
} from "@/types/api"

const PROVIDERS = ["OPENAI", "ANTHROPIC", "GOOGLE", "XAI", "OPENROUTER"] as const
type Provider = (typeof PROVIDERS)[number]

/** The live list is hundreds of rows; past this the search box is the UI. */
const MAX_CATALOG_ROWS = 40

/**
 * Add a model to 設定. A curated list of each provider's current models, plus
 * a free-text ID field.
 *
 * The free-text field is not a power-user afterthought — it is what keeps a
 * stale catalog from becoming a dead end. This project has already shipped a
 * model ID that the provider retired; when that happens next, the operator
 * needs to be able to type the replacement without waiting for a deploy.
 *
 * OpenRouter is the exception to "curated": its catalog is fetched live from
 * OpenRouter, searched here, and the chosen model's published price is
 * written to the pricing table in the same step — the list cannot go stale
 * and the price cannot be forgotten.
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

  // OpenRouter's live catalog. Loaded once per open, the first time the
  // provider is chosen; the server caches the upstream fetch.
  const [catalog, setCatalog] = useState<OpenRouterCatalogModelDto[] | null>(
    null
  )
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  // The price that travels with the picked row. Cleared when the ID is
  // edited by hand, because a typed ID is not the row that was picked.
  const [picked, setPicked] = useState<OpenRouterCatalogModelDto | null>(null)

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
      setCatalog(null)
      setCatalogError(null)
      setQuery("")
      setPicked(null)
    }
  }, [open])

  useEffect(() => {
    if (!open || provider !== "OPENROUTER" || catalog !== null) return
    let cancelled = false
    setCatalogError(null)
    fetch("/api/openrouter/models")
      .then(async (res) => {
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? t.settings.catalogFailed)
        return data as { models: OpenRouterCatalogModelDto[] }
      })
      .then((data) => {
        if (!cancelled) setCatalog(data.models)
      })
      .catch((err) => {
        if (!cancelled) {
          setCatalogError(
            err instanceof Error ? err.message : t.settings.catalogFailed
          )
        }
      })
    return () => {
      cancelled = true
    }
  }, [open, provider, catalog])

  const matches = useMemo(() => {
    if (!catalog) return []
    const q = query.trim().toLowerCase()
    if (!q) return catalog
    return catalog.filter(
      (m) =>
        m.modelId.toLowerCase().includes(q) ||
        m.displayName.toLowerCase().includes(q)
    )
  }, [catalog, query])

  if (!open) return null

  const isOpenRouter = provider === "OPENROUTER"

  const pick = (m: CatalogModel) => {
    setModelId(m.modelId)
    setDisplayName(m.displayName)
    setError(null)
  }

  const pickLive = (m: OpenRouterCatalogModelDto) => {
    setModelId(m.modelId)
    setDisplayName(m.displayName)
    setPicked(m)
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

      // The published price goes in with the model. Posting to /api/pricing
      // closes any previous row and opens a new one, so a re-added model gets
      // today's rate without touching yesterday's ledger snapshots.
      const price =
        isOpenRouter && picked && picked.modelId === id ? picked.pricing : null
      if (price) {
        const priced = await fetch("/api/pricing", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider,
            modelId: id,
            inputPerMillion: price.inputPerMillion,
            outputPerMillion: price.outputPerMillion,
            cachedInputPerMillion: price.cachedInputPerMillion,
            reasoningPerMillion: price.reasoningPerMillion,
            source: `openrouter.ai/api/v1/models，查證於 ${new Date()
              .toISOString()
              .slice(0, 10)}`,
          }),
        })
        if (!priced.ok) {
          // The model is in; say so rather than closing as if all went well.
          setError(t.settings.priceImportFailed)
          return
        }
      }
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  const staticCatalog = catalogFor(provider)

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
              {isOpenRouter ? t.settings.openRouterHint : t.settings.addModelHint}
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
                setPicked(null)
                setQuery("")
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

          {isOpenRouter ? (
            <div>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-gray-500">
                  {t.settings.searchModels}
                </span>
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t.settings.searchModelsPlaceholder}
                />
              </label>
              <div className="mt-2 max-h-72 space-y-1.5 overflow-y-auto">
                {catalogError ? (
                  <p className="text-sm text-red-500">{catalogError}</p>
                ) : catalog === null ? (
                  <p className="text-sm text-gray-400">
                    {t.settings.catalogLoading}
                  </p>
                ) : matches.length === 0 ? (
                  <p className="text-sm text-gray-400">
                    {t.settings.catalogEmpty}
                  </p>
                ) : (
                  <>
                    {matches.slice(0, MAX_CATALOG_ROWS).map((m) => (
                      <CatalogRow
                        key={m.modelId}
                        model={m}
                        selected={modelId === m.modelId}
                        already={existingKeys.has(`OPENROUTER/${m.modelId}`)}
                        onPick={() => pickLive(m)}
                      />
                    ))}
                    {matches.length > MAX_CATALOG_ROWS && (
                      <p className="px-1 pt-1 text-xs text-gray-400">
                        {t.settings.catalogMore(
                          matches.length - MAX_CATALOG_ROWS
                        )}
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>
          ) : (
            <div>
              <span className="mb-1.5 block text-xs font-medium text-gray-500">
                {t.settings.recentModels}
              </span>
              <div className="space-y-1.5">
                {staticCatalog.map((m) => {
                  const already = existingKeys.has(`${m.provider}/${m.modelId}`)
                  const selected = modelId === m.modelId
                  return (
                    <button
                      key={m.modelId}
                      type="button"
                      onClick={() => pick(m)}
                      className={rowClass(selected)}
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
          )}

          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-gray-500">
              {t.settings.modelIdLabel}
            </span>
            <Input
              value={modelId}
              onChange={(e) => {
                setModelId(e.target.value)
                setPicked(null)
              }}
              placeholder={
                isOpenRouter
                  ? t.settings.openRouterIdPlaceholder
                  : t.settings.modelIdPlaceholder
              }
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

function rowClass(selected: boolean): string {
  return cn(
    "flex w-full items-start gap-3 rounded-lg border px-3 py-2 text-left transition-colors",
    selected
      ? "border-rose-brand bg-rose-light/40"
      : "border-gray-200 bg-white hover:border-rose-brand"
  )
}

/** "128K" for a context window; the exact count is noise in a picker. */
function formatContext(tokens: number): string {
  return tokens >= 1000 ? `${Math.round(tokens / 1000)}K` : String(tokens)
}

function CatalogRow({
  model,
  selected,
  already,
  onPick,
}: {
  model: OpenRouterCatalogModelDto
  selected: boolean
  already: boolean
  onPick: () => void
}) {
  const detail = [
    model.modelId,
    model.contextLength !== null ? formatContext(model.contextLength) : null,
    model.pricing
      ? `$${model.pricing.inputPerMillion} / $${model.pricing.outputPerMillion} ${t.settings.perMillion}`
      : t.settings.catalogNoPrice,
  ]
    .filter(Boolean)
    .join(" · ")

  return (
    <button type="button" onClick={onPick} className={rowClass(selected)}>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2">
          <span
            className={cn(
              "text-sm font-semibold",
              selected ? "text-rose-dark" : "text-gray-900"
            )}
          >
            {model.displayName}
          </span>
          {already && (
            <span className="text-xs text-gray-400">
              · {t.settings.alreadyAdded}
            </span>
          )}
        </span>
        <span className="mt-0.5 block truncate text-xs text-gray-400">
          {detail}
        </span>
      </span>
      {selected && (
        <Check size={16} className="mt-0.5 shrink-0 text-rose-brand" />
      )}
    </button>
  )
}
