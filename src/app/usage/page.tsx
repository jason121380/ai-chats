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
import { PageBody, Topbar } from "@/components/layout/topbar"
import { t } from "@/lib/i18n"
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
        throw new Error(t.errors.loadUsage)
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
    <>
      <Topbar
        title={t.usage.title}
        subtitle={t.usage.subtitle}
        actions={(
          [
            ["today", t.usage.today],
            ["7d", t.usage.days7],
            ["30d", t.usage.days30],
            ["custom", t.usage.custom],
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
      />
      <PageBody>
        {/* The custom window lives here, not in the topbar: two date
            fields would not survive that 60px band on a phone. */}
        {range === "custom" && (
          <div className="flex flex-wrap items-center gap-2">
            <Input
              type="date"
              className="w-40"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
            />
            <span className="text-[13px] text-gray-500">{t.usage.to}</span>
            <Input
              type="date"
              className="w-40"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
            />
          </div>
        )}

      {error && <p className="text-[13px] text-red">{error}</p>}
      {loading && <Loader2 className="h-5 w-5 animate-spin text-orange" />}

      {summary && !loading && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
          <StatCard label={t.usage.totalSpend} value={formatUsd(summary.totalCostUsd)} />
          <StatCard
            label={t.usage.totalTokens}
            value={formatTokens(summary.totalTokens)}
          />
          <StatCard label={t.usage.totalCalls} value={String(summary.calls)} />
          <StatCard
            label={t.usage.successful}
            value={String(summary.successfulCalls)}
          />
          <StatCard label={t.usage.failed} value={String(summary.failedCalls)} />
          <StatCard
            label={t.usage.avgLatency}
            value={formatLatency(summary.averageLatencyMs)}
          />
        </div>
      )}

      {rows && !loading && (
        <div className="overflow-hidden rounded-[16px] border border-border bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t.usage.colModel}</TableHead>
                <TableHead>{t.usage.colProvider}</TableHead>
                <TableHead className="text-right">{t.usage.colCalls}</TableHead>
                <TableHead className="text-right">{t.usage.colInput}</TableHead>
                <TableHead className="text-right">{t.usage.colOutput}</TableHead>
                <TableHead className="text-right">{t.usage.colCached}</TableHead>
                <TableHead className="text-right">{t.usage.colReasoning}</TableHead>
                <TableHead className="text-right">{t.usage.colTotal}</TableHead>
                <TableHead className="text-right">{t.usage.colCost}</TableHead>
                <TableHead className="text-right">{t.usage.colAvgCost}</TableHead>
                <TableHead className="text-right">{t.usage.colAvgLatency}</TableHead>
                <TableHead className="text-right">{t.usage.colSuccessRate}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={12}
                    className="text-center text-sm text-muted-foreground"
                  >
                    {t.usage.emptyRange}
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
      </PageBody>
    </>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="kpi-card">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value text-[22px]">{value}</div>
    </div>
  )
}
