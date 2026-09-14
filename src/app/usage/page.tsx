"use client"

import { useCallback, useEffect, useState } from "react"
import { Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatLatency, formatTokens, formatUsd } from "@/lib/utils"
import {
  PROVIDER_LABELS,
  type ModelUsageRowDto,
  type UsageSummaryDto,
} from "@/types/api"

type RangeKey = "today" | "7d" | "30d" | "custom"

function rangeToDates(key: RangeKey, customFrom: string, customTo: string) {
  const now = new Date()
  if (key === "custom") {
    return {
      from: customFrom ? new Date(customFrom).toISOString() : undefined,
      to: customTo
        ? new Date(`${customTo}T23:59:59.999`).toISOString()
        : undefined,
    }
  }
  const from = new Date(now)
  if (key === "today") from.setHours(0, 0, 0, 0)
  if (key === "7d") from.setDate(from.getDate() - 7)
  if (key === "30d") from.setDate(from.getDate() - 30)
  return { from: from.toISOString(), to: now.toISOString() }
}

export default function UsagePage() {
  const [range, setRange] = useState<RangeKey>("30d")
  const [customFrom, setCustomFrom] = useState("")
  const [customTo, setCustomTo] = useState("")
  const [summary, setSummary] = useState<UsageSummaryDto | null>(null)
  const [rows, setRows] = useState<ModelUsageRowDto[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { from, to } = rangeToDates(range, customFrom, customTo)
      const qs = new URLSearchParams()
      if (from) qs.set("from", from)
      if (to) qs.set("to", to)
      const [summaryRes, modelsRes] = await Promise.all([
        fetch(`/api/usage/summary?${qs}`),
        fetch(`/api/usage/models?${qs}`),
      ])
      if (!summaryRes.ok || !modelsRes.ok) {
        throw new Error("Failed to load usage data")
      }
      setSummary((await summaryRes.json()) as UsageSummaryDto)
      setRows((await modelsRes.json()) as ModelUsageRowDto[])
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [range, customFrom, customTo])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Usage</h1>
          <p className="text-sm text-muted-foreground">
            Token, cost and latency analytics from the ModelRun billing
            ledger.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              ["today", "Today"],
              ["7d", "7 Days"],
              ["30d", "30 Days"],
              ["custom", "Custom"],
            ] as Array<[RangeKey, string]>
          ).map(([key, label]) => (
            <Button
              key={key}
              size="sm"
              variant={range === key ? "default" : "outline"}
              onClick={() => setRange(key)}
            >
              {label}
            </Button>
          ))}
          {range === "custom" && (
            <div className="flex items-center gap-2">
              <Input
                type="date"
                className="h-9 w-40"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
              />
              <span className="text-sm text-muted-foreground">to</span>
              <Input
                type="date"
                className="h-9 w-40"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
              />
            </div>
          )}
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {loading && <Loader2 className="h-5 w-5 animate-spin" />}

      {summary && !loading && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
          <StatCard label="Total Spend" value={formatUsd(summary.totalCostUsd)} />
          <StatCard
            label="Total Tokens"
            value={formatTokens(summary.totalTokens)}
          />
          <StatCard label="Total Calls" value={String(summary.calls)} />
          <StatCard
            label="Successful"
            value={String(summary.successfulCalls)}
          />
          <StatCard label="Failed" value={String(summary.failedCalls)} />
          <StatCard
            label="Avg Latency"
            value={formatLatency(summary.averageLatencyMs)}
          />
        </div>
      )}

      {rows && !loading && (
        <div className="rounded-lg border bg-background">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Model</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead className="text-right">Calls</TableHead>
                <TableHead className="text-right">Input Tokens</TableHead>
                <TableHead className="text-right">Output Tokens</TableHead>
                <TableHead className="text-right">Cached</TableHead>
                <TableHead className="text-right">Reasoning</TableHead>
                <TableHead className="text-right">Total Tokens</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead className="text-right">Avg Cost/Call</TableHead>
                <TableHead className="text-right">Avg Latency</TableHead>
                <TableHead className="text-right">Success Rate</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={12}
                    className="text-center text-sm text-muted-foreground"
                  >
                    No model runs in this period.
                  </TableCell>
                </TableRow>
              )}
              {rows.map((r) => (
                <TableRow key={`${r.provider}/${r.modelId}`}>
                  <TableCell className="font-medium">{r.modelId}</TableCell>
                  <TableCell>
                    {PROVIDER_LABELS[r.provider] ?? r.provider}
                  </TableCell>
                  <TableCell className="text-right">{r.calls}</TableCell>
                  <TableCell className="text-right">
                    {formatTokens(r.inputTokens)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatTokens(r.outputTokens)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatTokens(r.cachedInputTokens)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatTokens(r.reasoningTokens)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatTokens(r.totalTokens)}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatUsd(r.totalCostUsd)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatUsd(r.averageCostPerCallUsd)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatLatency(r.averageLatencyMs)}
                  </TableCell>
                  <TableCell className="text-right">
                    {r.successRate !== null
                      ? `${Math.round(r.successRate * 100)}%`
                      : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-background p-4">
      <div className="text-xl font-bold">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  )
}
