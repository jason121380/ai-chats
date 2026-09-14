"use client"

import { useEffect, useMemo, useState } from "react"
import { useParams } from "next/navigation"
import { Loader2 } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Markdown } from "@/components/ui/markdown"
import { ModelRunCard } from "@/components/council/model-run-card"
import { ChatTranscript } from "@/components/council/chat-transcript"
import { StatusBadge } from "@/components/models/model-picker"
import { useModels } from "@/components/models/use-models"
import { formatTokens, formatUsd } from "@/lib/utils"
import {
  formatDateTime,
  kindLabel,
  modeLabel,
  sourceLabel,
  stageLabel,
  t,
} from "@/lib/i18n"
import type { CouncilRunDto, SessionDetailDto } from "@/types/api"

export default function SessionDetailPage() {
  const params = useParams<{ id: string }>()
  const { models } = useModels()
  const [session, setSession] = useState<SessionDetailDto | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!params?.id) return
    fetch(`/api/sessions/${params.id}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(t.errors.loadSession)
        setSession((await res.json()) as SessionDetailDto)
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : String(err))
      )
  }, [params?.id])

  const grouped = useMemo((): {
    byCouncil: Map<string, SessionDetailDto["modelRuns"]>
    standalone: SessionDetailDto["modelRuns"]
  } => {
    if (!session) return { byCouncil: new Map(), standalone: [] }
    const byCouncil = new Map<string, SessionDetailDto["modelRuns"]>()
    const standalone: SessionDetailDto["modelRuns"] = []
    for (const run of session.modelRuns) {
      if (run.councilRunId) {
        const list = byCouncil.get(run.councilRunId) ?? []
        list.push(run)
        byCouncil.set(run.councilRunId, list)
      } else {
        standalone.push(run)
      }
    }
    return { byCouncil, standalone }
  }, [session])

  if (error) return <p className="p-6 text-sm text-destructive">{error}</p>
  if (!session) {
    return (
      <div className="p-6">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    )
  }

  const isMultiModel = session.councilRuns.length > 0
  const userQuestion =
    session.messages.find((m) => m.source === "USER")?.content ?? ""

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{session.title}</h1>
          <p className="text-sm text-muted-foreground">
            <Badge variant="secondary" className="mr-2">
              {modeLabel(session.mode)}
            </Badge>
            {formatDateTime(session.createdAt)}
          </p>
        </div>
        <div className="text-right text-sm">
          <div className="font-semibold">
            {formatUsd(session.cost.totalCostUsd)} ·{" "}
            {formatTokens(session.cost.totalTokens)} Token
          </div>
          <div className="text-xs text-muted-foreground">
            {t.history.modelCalls(session.cost.modelCalls)}
          </div>
        </div>
      </div>

      {isMultiModel ? (
        session.councilRuns.map((councilRun) => {
          const runs = grouped.byCouncil.get(councilRun.id) ?? []
          const chairmanRunIds = new Set(
            runs.filter((r) => r.stage === "CHAIRMAN").map((r) => r.id)
          )
          const finalAnswer =
            session.messages.find(
              (m) =>
                m.source === "CHAIRMAN" &&
                m.modelRunId !== null &&
                chairmanRunIds.has(m.modelRunId)
            )?.content ?? null

          const dto: CouncilRunDto = {
            ...councilRun,
            modelRuns: runs,
            finalAnswer,
          }

          return (
            <div key={councilRun.id} className="space-y-5">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={councilRun.status} />
                <Badge variant="outline">{kindLabel(councilRun.kind)}</Badge>
                <span className="ml-auto text-xs text-muted-foreground">
                  {formatTokens(councilRun.totalTokens)} Token ·{" "}
                  {formatUsd(councilRun.totalCostUsd)}
                </span>
              </div>

              <ChatTranscript
                run={dto}
                question={userQuestion}
                models={models}
              />

              <Card>
                <CardContent className="p-4">
                  <CostBreakdown
                    runs={runs}
                    total={councilRun.totalCostUsd}
                    kind={councilRun.kind}
                  />
                </CardContent>
              </Card>
            </div>
          )
        })
      ) : (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">{t.history.conversation}</h2>
          {session.messages.length === 0 && (
            <p className="text-sm text-muted-foreground">{t.history.noMessages}</p>
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
                <div className="mb-1 text-[10px] tracking-wide text-muted-foreground">
                  {sourceLabel(m.source)}
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
      )}

      {grouped.standalone.length > 0 && isMultiModel && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">{t.history.otherCalls}</h2>
          {grouped.standalone.map((r) => (
            <ModelRunCard key={r.id} run={r} />
          ))}
        </section>
      )}
    </div>
  )
}

function CostBreakdown({
  runs,
  total,
  kind,
}: {
  runs: SessionDetailDto["modelRuns"]
  total: string | null
  kind: string
}) {
  const stageOrder = ["ROUND_1", "CRITIQUE", "DISCUSSION", "CHAIRMAN"]
  const sorted = [...runs].sort(
    (a, b) =>
      stageOrder.indexOf(a.stage) - stageOrder.indexOf(b.stage) ||
      (a.roundNumber ?? 0) - (b.roundNumber ?? 0) ||
      (a.turnIndex ?? 0) - (b.turnIndex ?? 0)
  )
  return (
    <div className="text-sm">
      <p className="mb-2 text-xs font-semibold text-muted-foreground">
        {kind === "DISCUSSION"
          ? t.history.costBreakdownDiscussion
          : t.history.costBreakdown}
      </p>
      <div className="space-y-1">
        {sorted.map((r) => (
          <div key={r.id} className="flex items-center justify-between gap-2">
            <span className="truncate">
              {r.modelId}{" "}
              <span className="text-xs text-muted-foreground">
                {r.stage === "DISCUSSION" && r.roundNumber
                  ? t.transcript.round(r.roundNumber)
                  : stageLabel(r.stage)}
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
        <span>{t.history.total}</span>
        <span className="tabular-nums">{formatUsd(total)}</span>
      </div>
    </div>
  )
}
