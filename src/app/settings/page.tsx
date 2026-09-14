"use client"

import { useCallback, useEffect, useState } from "react"
import { Loader2 } from "lucide-react"

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
import {
  PROVIDER_LABELS,
  ROLE_LABELS,
  type ModelConfigDto,
  type PricingRowDto,
} from "@/types/api"

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Model configuration and pricing. Pricing history is append-only —
          historical ModelRun snapshots are never rewritten.
        </p>
      </div>
      <Tabs defaultValue="models">
        <TabsList>
          <TabsTrigger value="models">Models</TabsTrigger>
          <TabsTrigger value="pricing">Pricing</TabsTrigger>
        </TabsList>
        <TabsContent value="models">
          <ModelsTab />
        </TabsContent>
        <TabsContent value="pricing">
          <PricingTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function ModelsTab() {
  const [models, setModels] = useState<ModelConfigDto[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    fetch("/api/models")
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to load models")
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

  if (error) return <p className="text-sm text-destructive">{error}</p>
  if (!models) return <Loader2 className="h-5 w-5 animate-spin" />

  return (
    <div className="rounded-lg border bg-background">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Provider</TableHead>
            <TableHead>Model</TableHead>
            <TableHead>Enabled</TableHead>
            <TableHead>Council Role</TableHead>
            <TableHead className="text-right">Temperature</TableHead>
            <TableHead className="text-right">Max Output</TableHead>
            <TableHead>Pricing</TableHead>
            <TableHead>API Key</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {models.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={8}
                className="text-center text-sm text-muted-foreground"
              >
                No models configured. Run <code>npm run db:seed</code>.
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
                  <Badge variant="success">configured</Badge>
                ) : (
                  <Badge variant="warning">not configured</Badge>
                )}
              </TableCell>
              <TableCell>
                {m.providerConfigured ? (
                  <Badge variant="success">present</Badge>
                ) : (
                  <Badge variant="destructive">missing</Badge>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function PricingTab() {
  const [rows, setRows] = useState<PricingRowDto[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/pricing")
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to load pricing")
        setRows((await res.json()) as PricingRowDto[])
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : String(err))
      )
  }, [])

  if (error) return <p className="text-sm text-destructive">{error}</p>
  if (!rows) return <Loader2 className="h-5 w-5 animate-spin" />

  return (
    <div className="rounded-lg border bg-background">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Provider</TableHead>
            <TableHead>Model</TableHead>
            <TableHead className="text-right">Input / 1M</TableHead>
            <TableHead className="text-right">Output / 1M</TableHead>
            <TableHead className="text-right">Cached / 1M</TableHead>
            <TableHead className="text-right">Reasoning / 1M</TableHead>
            <TableHead>Effective</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={8}
                className="text-center text-sm text-muted-foreground"
              >
                Pricing not configured. Add rows via seed or POST /api/pricing.
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
                  {new Date(r.effectiveFrom).toLocaleDateString()}
                  {r.effectiveTo
                    ? ` → ${new Date(r.effectiveTo).toLocaleDateString()}`
                    : " → now"}
                </TableCell>
                <TableCell>
                  {active ? (
                    <Badge variant="success">active</Badge>
                  ) : (
                    <Badge variant="secondary">historical</Badge>
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
