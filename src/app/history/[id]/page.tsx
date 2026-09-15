"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useParams } from "next/navigation"
import { Coins, FileText, Gavel, Loader2 } from "lucide-react"

import { PageShell } from "@/components/layout/page-shell"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Markdown } from "@/components/ui/markdown"
import { ModelRunCard } from "@/components/council/model-run-card"
import { ChatTranscript } from "@/components/council/chat-transcript"
import { DiscussionComposer } from "@/components/council/discussion-composer"
import { DetailModal } from "@/components/council/detail-modal"
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

/** A run in one of these states is over; anything else is still sitting. */
const TERMINAL = ["COMPLETED", "PARTIAL", "FAILED", "CANCELLED"]

export default function SessionDetailPage() {
  const params = useParams<{ id: string }>()
  const { models } = useModels()
  const [session, setSession] = useState<SessionDetailDto | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [summaryOpen, setSummaryOpen] = useState(false)
  const [costOpen, setCostOpen] = useState(false)
  const bottomRef = useRef<HTMLDivElement | null>(null)

  const load = useCallback(async (id: string) => {
    const res = await fetch(`/api/sessions/${id}`)
    if (!res.ok) throw new Error(t.errors.loadSession)
    setSession((await res.json()) as SessionDetailDto)
  }, [])

  useEffect(() => {
    if (!params?.id) return
    load(params.id).catch((err) =>
      setError(err instanceof Error ? err.message : String(err))
    )
  }, [params?.id, load])

  const active = useMemo(
    () =>
      (session?.councilRuns ?? []).some((r) => !TERMINAL.includes(r.status)),
    [session]
  )

  // Only polls while a run is actually sitting — which, on a history page, is
  // the window between reopening a discussion and it finishing. A finished
  // record does not change, and polling it forever would be a request every
  // two seconds for a page left open in a tab.
  useEffect(() => {
    const id = params?.id
    if (!id || !active) return
    const interval = setInterval(() => {
      load(id).catch(() => {
        // transient — the next tick tries again
      })
    }, 2000)
    return () => clearInterval(interval)
  }, [params?.id, active, load])

  useEffect(() => {
    if (active) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
    }
  }, [session, active])

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

  /** Every council run in this session, filled in with its runs and summary. */
  const runs = useMemo((): CouncilRunDto[] => {
    if (!session) return []
    return session.councilRuns.map((councilRun) => {
      const modelRuns = grouped.byCouncil.get(councilRun.id) ?? []
      const chairmanRunIds = new Set(
        modelRuns.filter((r) => r.stage === "CHAIRMAN").map((r) => r.id)
      )
      // Last, not first: continuing a discussion writes a new closing summary
      // and the old one stays in the table. Messages arrive oldest-first, so
      // `.find` would keep handing back the summary of a meeting that has
      // since moved on.
      const finalAnswer =
        [...session.messages]
          .reverse()
          .find(
            (m) =>
              m.source === "CHAIRMAN" &&
              m.modelRunId !== null &&
              chairmanRunIds.has(m.modelRunId)
          )?.content ?? null
      return { ...councilRun, modelRuns, finalAnswer }
    })
  }, [session, grouped])

  if (error) return <p className="text-sm text-red-500">{error}</p>
  if (!session) {
    return <Loader2 className="h-5 w-5 animate-spin text-rose-brand" />
  }

  const isMultiModel = runs.length > 0
  const userQuestion =
    session.messages.find((m) => m.source === "USER")?.content ?? ""
  // One session holds one meeting: /council and /discussion each open their
  // own. The corner buttons act on the latest one so the pathological case
  // still points somewhere sensible rather than at the oldest.
  const headline = runs[runs.length - 1] ?? null

  return (
    <PageShell
      width="narrow"
      title={session.title}
      description={
        <span className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{modeLabel(session.mode)}</Badge>
          {formatDateTime(session.createdAt)}
        </span>
      }
      actions={
        headline ? (
          <div className="flex items-center gap-1">
            <CornerButton
              label={t.discussion.summary}
              onClick={() => setSummaryOpen(true)}
              disabled={!headline.finalAnswer}
              title={
                headline.finalAnswer ? undefined : t.discussion.summaryPending
              }
            >
              <FileText size={16} />
            </CornerButton>
            <CornerButton
              label={t.discussion.costDetail}
              onClick={() => setCostOpen(true)}
            >
              <Coins size={16} />
            </CornerButton>
          </div>
        ) : undefined
      }
    >
      {isMultiModel ? (
        runs.map((run) => (
          <div key={run.id} className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={run.status} />
              <Badge variant="outline">{kindLabel(run.kind)}</Badge>
              <span className="ml-auto text-xs text-muted-foreground">
                {formatTokens(run.totalTokens)} Token ·{" "}
                {formatUsd(run.totalCostUsd)}
              </span>
            </div>

            {/* A chat window, not a page section: the transcript owns its own
                scroll so the composer stays at the bottom instead of sitting
                below however long the meeting ran.

                No `overflow-hidden` on this card, however tidy it would make
                the corners — an overflow ancestor turns the composer's
                `sticky` into a no-op, silently. The corners are rounded on
                the two children instead. */}
            <div className="rounded-lg border border-gray-200 bg-white">
              <div className="max-h-[min(65vh,620px)] space-y-4 overflow-y-auto rounded-t-lg bg-gray-50 p-4 pb-24">
                <ChatTranscript
                  run={run}
                  question={userQuestion}
                  models={models}
                  showSummary={false}
                />
                <div ref={bottomRef} />
              </div>
              {run.kind === "DISCUSSION" && (
                <DiscussionComposer
                  runId={run.id}
                  finished={TERMINAL.includes(run.status)}
                  canContinue
                  onSent={() => {
                    if (params?.id) void load(params.id).catch(() => {})
                  }}
                />
              )}
            </div>
          </div>
        ))
      ) : (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">{t.history.conversation}</h2>
          {session.messages.length === 0 && (
            <p className="text-sm text-muted-foreground">
              {t.history.noMessages}
            </p>
          )}
          {session.messages.map((m) => (
            <div
              key={m.id}
              className={
                m.source === "USER"
                  ? "ml-auto max-w-[85%] rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground"
                  : "mr-auto max-w-[85%] rounded-lg border border-border bg-white px-3 py-2 text-sm"
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

      <DetailModal
        open={summaryOpen}
        onClose={() => setSummaryOpen(false)}
        title={t.discussion.summary}
        icon={<Gavel className="h-4 w-4 text-rose-brand" />}
      >
        {headline?.finalAnswer ? (
          <Markdown>{headline.finalAnswer}</Markdown>
        ) : (
          <p className="text-sm text-gray-400">{t.discussion.summaryPending}</p>
        )}
      </DetailModal>

      <DetailModal
        open={costOpen}
        onClose={() => setCostOpen(false)}
        title={t.discussion.costDetail}
        icon={<Coins className="h-4 w-4 text-rose-brand" />}
      >
        {headline && (
          <CostBreakdown
            runs={headline.modelRuns}
            total={headline.totalCostUsd}
            kind={headline.kind}
          />
        )}
      </DetailModal>
    </PageShell>
  )
}

/** An icon button in the page's top-right corner. */
function CornerButton({
  label,
  onClick,
  disabled,
  title,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  title?: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={title ?? label}
      className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 transition-colors hover:border-rose-light hover:text-rose-brand disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-gray-200 disabled:hover:text-gray-500"
    >
      {children}
    </button>
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
