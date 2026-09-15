"use client"

import { useCallback, useEffect, useState } from "react"
import { Loader2, Plus } from "lucide-react"

import { PageShell } from "@/components/layout/page-shell"
import { AddModelDialog } from "@/components/models/add-model-dialog"
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
          </TableRow>
        </TableHeader>
        <TableBody>
          {models.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={8}
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

  useEffect(() => {
    fetch("/api/pricing")
      .then(async (res) => {
        if (!res.ok) throw new Error(t.errors.loadPricing)
        setRows((await res.json()) as PricingRowDto[])
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : String(err))
      )
  }, [])

  if (error) return <p className="text-sm text-red-500">{error}</p>
  if (!rows) return <Loader2 className="h-5 w-5 animate-spin text-rose-brand" />

  return (
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
                  ${r.inputPerMillion}
                </TableCell>
                <TableCell className="text-right">
                  ${r.outputPerMillion}
                </TableCell>
                <TableCell className="text-right">
                  {r.cachedInputPerMillion ? `$${r.cachedInputPerMillion}` : "—"}
                </TableCell>
                <TableCell className="text-right">
                  {r.reasoningPerMillion ? `$${r.reasoningPerMillion}` : "—"}
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
  )
}
