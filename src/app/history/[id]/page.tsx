"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { Loader2 } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Markdown } from "@/components/ui/markdown"
import { ModelRunCard } from "@/components/council/model-run-card"
import { StatusBadge } from "@/components/models/model-picker"
import { formatTokens, formatUsd } from "@/lib/utils"
import type { SessionDetailDto } from "@/types/api"

export default function SessionDetailPage() {
  const params = useParams<{ id: string }>()
  const [session, setSession] = useState<SessionDetailDto | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!params?.id) return
    fetch(`/api/sessions/${params.id}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to load session")
        setSession((await res.json()) as SessionDetailDto)
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : String(err))
      )
  }, [params?.id])

  if (error) {
    return <p className="p-6 text-sm text-destructive">{error}</p>
  }
  if (!session) {
    return (
      <div className="p-6">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    )
  }

  const runsByCouncil = new Map<string, typeof session.modelRuns>()
  const standaloneRuns: typeof session.modelRuns = []
  for (const run of session.modelRuns) {
    if (run.councilRunId) {
      const list = runsByCouncil.get(run.councilRunId) ?? []
      list.push(run)
      runsByCouncil.set(run.councilRunId, list)
    } else {
      standaloneRuns.push(run)
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {session.title}
          </h1>
          <p className="text-sm text-muted-foreground">
            <Badge variant="secondary" className="mr-2">
              {session.mode}
            </Badge>
            {new Date(session.createdAt).toLocaleString()}
          </p>
        </div>
        <div className="text-right text-sm">
          <div className="font-semibold">
            {formatUsd(session.cost.totalCostUsd)} ·{" "}
            {formatTokens(session.cost.totalTokens)} tokens
          </div>
          <div className="text-xs text-muted-foreground">
            {session.cost.modelCalls} model calls
          </div>
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Conversation</h2>
        {session.messages.length === 0 && (
          <p className="text-sm text-muted-foreground">No messages.</p>
        )}
        {session.messages.map((m) => (
          <div
            key={m.id}
            className={
              m.source === "USER"
                ? "ml-auto max-w-[85%] rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground"
                : "mr-auto max-w-[85%] rounded-lg border bg-background px-3 py-2 text-sm"
            }
          >
            {m.source !== "USER" && (
              <div className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                {m.source}
              </div>
            )}
            {m.source === "USER" ? (
              <div className="whitespace-pre-wrap">{m.content}</div>
            ) : (
              <Markdown>{m.content}</Markdown>
            )}
          </div>
        ))}
      </section>

      {session.councilRuns.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Council runs</h2>
          {session.councilRuns.map((run) => {
            const runs = runsByCouncil.get(run.id) ?? []
            return (
              <Card key={run.id}>
                <CardContent className="space-y-3 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <StatusBadge status={run.status} />
                      <span className="text-xs text-muted-foreground">
                        Chairman: {run.chairmanModel}
                      </span>
                    </div>
                    <div className="text-right text-xs text-muted-foreground">
                      {formatTokens(run.totalTokens)} tokens ·{" "}
                      {formatUsd(run.totalCostUsd)}
                    </div>
                  </div>
                  <CouncilCostBreakdown runs={runs} total={run.totalCostUsd} />
                </CardContent>
              </Card>
            )
          })}
        </section>
      )}

      {standaloneRuns.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Model calls</h2>
          {standaloneRuns.map((r) => (
            <ModelRunCard key={r.id} run={r} />
          ))}
        </section>
      )}
    </div>
  )
}

function CouncilCostBreakdown({
  runs,
  total,
}: {
  runs: SessionDetailDto["modelRuns"]
  total: string | null
}) {
  const stageOrder = ["ROUND_1", "CRITIQUE", "CHAIRMAN"]
  const sorted = [...runs].sort(
    (a, b) => stageOrder.indexOf(a.stage) - stageOrder.indexOf(b.stage)
  )
  return (
    <div className="rounded-md border bg-muted/30 p-3 text-sm">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Council cost breakdown
      </p>
      <div className="space-y-1">
        {sorted.map((r) => (
          <div key={r.id} className="flex items-center justify-between gap-2">
            <span className="truncate">
              {r.modelId}{" "}
              <span className="text-xs text-muted-foreground">
                {r.stage.replace("_", " ")}
              </span>
              {r.status !== "COMPLETED" && (
                <span className="ml-1 text-xs text-destructive">
                  ({r.status})
                </span>
              )}
            </span>
            <span className="shrink-0 tabular-nums">
              {formatUsd(r.totalCostUsd)}
            </span>
          </div>
        ))}
      </div>
      <Separator className="my-2" />
      <div className="flex items-center justify-between font-semibold">
        <span>Total</span>
        <span className="tabular-nums">{formatUsd(total)}</span>
      </div>
    </div>
  )
}
