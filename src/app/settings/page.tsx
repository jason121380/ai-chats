"use client"

import { useCallback, useEffect, useState } from "react"
import { Loader2, Plus, Trash2 } from "lucide-react"

import { PageShell } from "@/components/layout/page-shell"
import { AddModelDialog } from "@/components/models/add-model-dialog"
import { ApplyPricesDialog } from "@/components/models/apply-prices-dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatDate, t } from "@/lib/i18n"
import { CURRENCY_PREFIX } from "@/lib/utils"
import {
  PROVIDER_LABELS,
  ROLE_LABELS,
  type ModelConfigDto,
  type PricingRowDto,
} from "@/types/api"

export default function SettingsPage() {
  return (
    <PageShell title={t.settings.title} description={t.settings.subtitle}>
      <Tabs defaultValue="models">
          <TabsList>
            <TabsTrigger value="models">{t.settings.tabModels}</TabsTrigger>
            <TabsTrigger value="pricing">{t.settings.tabPricing}</TabsTrigger>
          </TabsList>
          <TabsContent value="models">
            <ModelsTab />
          </TabsContent>
          <TabsContent value="pricing">
            <PricingTab />
          </TabsContent>
        </Tabs>
    </PageShell>
  )
}

function ModelsTab() {
  const [models, setModels] = useState<ModelConfigDto[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState<string | null>(null)
  // Separate from `error`: that one replaces the whole table, which is right
  // for "the list would not load" and wrong for "one delete failed".
  const [actionError, setActionError] = useState<string | null>(null)

  const load = useCallback(() => {
    fetch("/api/models")
      .then(async (res) => {
        if (!res.ok) throw new Error(t.errors.loadModels)
        setModels((await res.json()) as ModelConfigDto[])
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : String(err))
      )
  }, [])

  useEffect(load, [load])

  const update = async (
    model: ModelConfigDto,
    patch: Record<string, unknown>
  ) => {
    const res = await fetch("/api/models", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: model.provider,
        modelId: model.modelId,
        ...patch,
      }),
    })
    if (res.ok) load()
  }

  const remove = async (model: ModelConfigDto) => {
    if (!window.confirm(t.settings.removeConfirm(model.displayName))) return
    const key = `${model.provider}/${model.modelId}`
    setRemoving(key)
    setActionError(null)
    try {
      const res = await fetch("/api/models", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: model.provider,
          modelId: model.modelId,
        }),
      })
      if (!res.ok) throw new Error(t.settings.removeFailed)
      // Drop it locally as well: load() is a round trip, and leaving the row
      // on screen until it lands reads as "the click did nothing".
      setModels((prev) => prev?.filter((m) => m.id !== model.id) ?? prev)
      load()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err))
    } finally {
      setRemoving(null)
    }
  }

  if (error) return <p className="text-sm text-red-500">{error}</p>
  if (!models) return <Loader2 className="h-5 w-5 animate-spin text-rose-brand" />

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setAdding(true)}>
          <Plus size={15} />
          {t.settings.addModel}
        </Button>
      </div>
      <AddModelDialog
        open={adding}
        onClose={() => setAdding(false)}
        onAdded={load}
        existingKeys={
          new Set(models.map((m) => `${m.provider}/${m.modelId}`))
        }
      />
      {actionError && (
        <p className="text-sm text-red-500">{actionError}</p>
      )}
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t.settings.colProvider}</TableHead>
            <TableHead>{t.settings.colModel}</TableHead>
            <TableHead>{t.settings.colEnabled}</TableHead>
            <TableHead>{t.settings.colRole}</TableHead>
            <TableHead className="text-right">{t.settings.colTemperature}</TableHead>
            <TableHead className="text-right">{t.settings.colMaxOutput}</TableHead>
            <TableHead>{t.settings.colPricing}</TableHead>
            <TableHead>{t.settings.colApiKey}</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {models.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={9}
                className="text-center text-sm text-muted-foreground"
              >
                {t.settings.noModels}
              </TableCell>
            </TableRow>
          )}
          {models.map((m) => (
            <TableRow key={m.id}>
              <TableCell>{PROVIDER_LABELS[m.provider] ?? m.provider}</TableCell>
              <TableCell>
                <div className="font-medium">{m.displayName}</div>
                <div className="text-xs text-muted-foreground">{m.modelId}</div>
              </TableCell>
              <TableCell>
                <Switch
                  checked={m.enabled}
                  onCheckedChange={(checked) => update(m, { enabled: checked })}
                />
              </TableCell>
              <TableCell>
                <Select
                  value={m.defaultRole}
                  onValueChange={(role) => update(m, { defaultRole: role })}
                >
                  <SelectTrigger className="h-8 w-44">
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
              </TableCell>
              <TableCell className="text-right">
                {m.temperature ?? "—"}
              </TableCell>
              <TableCell className="text-right">
                {m.maxOutputTokens ?? "—"}
              </TableCell>
              <TableCell>
                {m.pricingConfigured ? (
                  <Badge variant="success">{t.settings.pricingConfigured}</Badge>
                ) : (
                  <Badge variant="warning">{t.settings.pricingMissing}</Badge>
                )}
              </TableCell>
              <TableCell>
                {m.providerConfigured ? (
                  <Badge variant="success">{t.settings.apiKeyPresent}</Badge>
                ) : (
                  <Badge variant="destructive">{t.settings.apiKeyMissing}</Badge>
                )}
              </TableCell>
              <TableCell>
                <button
                  type="button"
                  onClick={() => remove(m)}
                  disabled={removing !== null}
                  aria-label={`${t.settings.remove} ${m.displayName}`}
                  title={t.settings.remove}
                  className="text-gray-400 transition-colors hover:text-red-500 disabled:opacity-40"
                >
                  {removing === `${m.provider}/${m.modelId}` ? (
                    <Loader2 size={15} className="animate-spin" />
                  ) : (
                    <Trash2 size={15} />
                  )}
                </button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      </div>
    </div>
  )
}

function PricingTab() {
  const [rows, setRows] = useState<PricingRowDto[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [applying, setApplying] = useState(false)
  const [backfilling, setBackfilling] = useState(false)
  const [backfillNote, setBackfillNote] = useState<string | null>(null)

  const load = useCallback(() => {
    fetch("/api/pricing")
      .then(async (res) => {
        if (!res.ok) throw new Error(t.errors.loadPricing)
        setRows((await res.json()) as PricingRowDto[])
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : String(err))
      )
  }, [])

  useEffect(load, [load])

  if (error) return <p className="text-sm text-red-500">{error}</p>
  if (!rows) return <Loader2 className="h-5 w-5 animate-spin text-rose-brand" />

  const backfill = async () => {
    setBackfilling(true)
    setBackfillNote(null)
    try {
      const res = await fetch("/api/pricing/backfill", { method: "POST" })
      const data = (await res.json()) as {
        filled?: number
        skipped?: number
        error?: string
      }
      if (!res.ok) throw new Error(data.error ?? t.errors.requestFailed)
      const filled = data.filled ?? 0
      setBackfillNote(
        filled === 0 && (data.skipped ?? 0) === 0
          ? t.settings.backfillNone
          : t.settings.backfillDone(filled, data.skipped ?? 0)
      )
    } catch (err) {
      setBackfillNote(err instanceof Error ? err.message : String(err))
    } finally {
      setBackfilling(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={backfill} disabled={backfilling}>
          {backfilling ? t.settings.backfilling : t.settings.backfill}
        </Button>
        <Button onClick={() => setApplying(true)}>
          {t.settings.applyPrices}
        </Button>
      </div>
      <p className="text-xs text-gray-400">{t.settings.backfillHint}</p>
      {backfillNote && (
        <p className="text-sm text-gray-600">{backfillNote}</p>
      )}
      <ApplyPricesDialog
        open={applying}
        onClose={() => setApplying(false)}
        onApplied={load}
        rows={rows}
      />
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t.settings.colProvider}</TableHead>
            <TableHead>{t.settings.colModel}</TableHead>
            <TableHead className="text-right">{t.settings.colInputPer}</TableHead>
            <TableHead className="text-right">{t.settings.colOutputPer}</TableHead>
            <TableHead className="text-right">{t.settings.colCachedPer}</TableHead>
            <TableHead className="text-right">{t.settings.colReasoningPer}</TableHead>
            <TableHead>{t.settings.colEffective}</TableHead>
            <TableHead>{t.settings.colStatus}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={8}
                className="text-center text-sm text-muted-foreground"
              >
                {t.settings.noPricing}
              </TableCell>
            </TableRow>
          )}
          {rows.map((r) => {
            const active =
              new Date(r.effectiveFrom) <= new Date() &&
              (!r.effectiveTo || new Date(r.effectiveTo) > new Date())
            return (
              <TableRow key={r.id}>
                <TableCell>
                  {PROVIDER_LABELS[r.provider] ?? r.provider}
                </TableCell>
                <TableCell className="font-medium">{r.modelId}</TableCell>
                <TableCell className="text-right">
                  {CURRENCY_PREFIX}
                  {r.inputPerMillion}
                </TableCell>
                <TableCell className="text-right">
                  {CURRENCY_PREFIX}
                  {r.outputPerMillion}
                </TableCell>
                <TableCell className="text-right">
                  {r.cachedInputPerMillion
                    ? `${CURRENCY_PREFIX}${r.cachedInputPerMillion}`
                    : "—"}
                </TableCell>
                <TableCell className="text-right">
                  {r.reasoningPerMillion
                    ? `${CURRENCY_PREFIX}${r.reasoningPerMillion}`
                    : "—"}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {formatDate(r.effectiveFrom)}
                  {r.effectiveTo
                    ? ` → ${formatDate(r.effectiveTo)}`
                    : ` → ${t.settings.now}`}
                </TableCell>
                <TableCell>
                  {active ? (
                    <Badge variant="success">{t.settings.active}</Badge>
                  ) : (
                    <Badge variant="secondary">{t.settings.historical}</Badge>
                  )}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
      </div>
    </div>
  )
}
