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
import { ConvertedNote } from "@/components/layout/converted-note"
import { useModels } from "@/components/models/use-models"
import { formatTokens } from "@/lib/utils"
import { useMoney } from "@/components/layout/currency-context"
import {
  formatDateTime,
  modeLabel,
  sourceLabel,
  stageLabel,
  statusLabel,
  t,
} from "@/lib/i18n"
import type { CouncilRunDto, SessionDetailDto } from "@/types/api"

/** A run in one of these states is over; anything else is still sitting. */
const TERMINAL = ["COMPLETED", "PARTIAL", "FAILED", "CANCELLED"]

export default function SessionDetailPage() {
  const params = useParams<{ id: string }>()
  const { models } = useModels()
  const money = useMoney()
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
  // second for a page left open in a tab.
  //
  // One second rather than two because a turn's text is written as it
  // streams: the poll interval IS the frame rate of the text appearing, and
  // at two seconds a ten-second answer lands in five visible jumps.
  useEffect(() => {
    const id = params?.id
    if (!id || !active) return
    const interval = setInterval(() => {
      load(id).catch(() => {
        // transient — the next tick tries again
      })
    }, 1000)
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

  const isDiscussion = runs.length > 0
  const userQuestion =
    session.messages.find((m) => m.source === "USER")?.content ?? ""
  // One session holds one meeting: /council and /discussion each open their
  // own. The corner buttons and the composer act on the latest one so the
  // pathological case still points somewhere sensible rather than the oldest.
  const headline = runs[runs.length - 1] ?? null

  const detailModals = (
    <>
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
          <>
            <CostBreakdown
              runs={headline.modelRuns}
              total={headline.totalCostUsd}
              kind={headline.kind}
            />
            <ConvertedNote className="mt-3 text-xs text-gray-400" />
          </>
        )}
      </DetailModal>
    </>
  )

  // A session that is not a meeting — a solo or compare chat — has no rounds
  // and nothing to send, so it stays an ordinary scrolling page.
  if (!isDiscussion) {
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
      >
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
        {detailModals}
      </PageShell>
    )
  }

  return (
    // A chat screen, not a page: exactly the height left under the app
    // header, so the window itself never scrolls and the composer is at the
    // bottom of the SCREEN rather than at the bottom of a document you have
    // to travel to. The subtracted values are the header (h-14) plus this
    // main element's own padding (p-4 / md:p-8); a test pins them to the
    // shell so a change there cannot quietly leave a scrolling page behind.
    <div className="mx-auto flex h-[calc(100dvh-5.5rem)] max-w-3xl flex-col md:h-[calc(100dvh-7.5rem)]">
      {/* Two lines of chrome, not five. Everything else that used to live up
          here — status, kind, tokens, cost — is either a word in the meta
          line or behind one of the two icons. */}
      <div className="flex shrink-0 items-start gap-2 pb-2">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-semibold text-gray-900">
            {session.title}
          </h1>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-gray-400">
            <span>{modeLabel(session.mode)}</span>
            <span aria-hidden>·</span>
            <span>{formatDateTime(session.createdAt)}</span>
            {headline && (
              <>
                <span aria-hidden>·</span>
                <span>{statusLabel(headline.status)}</span>
                <span aria-hidden>·</span>
                <span>
                  {formatTokens(headline.totalTokens)} Token ·{" "}
                  {money.format(headline.totalCostUsd)}
                </span>
              </>
            )}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <CornerButton
            label={t.discussion.summary}
            onClick={() => setSummaryOpen(true)}
            disabled={!headline?.finalAnswer}
            title={headline?.finalAnswer ? undefined : t.discussion.summaryPending}
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
      </div>

      {/* The only thing on this screen that scrolls. No card around it: the
          messages are already bubbles on the page background, and a frame
          around a frame only costs the conversation vertical room. */}
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto pb-4">
        {runs.map((run) => (
          <ChatTranscript
            key={run.id}
            run={run}
            question={userQuestion}
            models={models}
            showSummary={false}
          />
        ))}
        {grouped.standalone.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-gray-500">
              {t.history.otherCalls}
            </h2>
            {grouped.standalone.map((r) => (
              <ModelRunCard key={r.id} run={r} />
            ))}
          </section>
        )}
        <div ref={bottomRef} />
      </div>

      {headline?.kind === "DISCUSSION" && (
        <DiscussionComposer
          runId={headline.id}
          finished={TERMINAL.includes(headline.status)}
          canContinue
          className="shrink-0 border-t border-gray-200 bg-transparent px-0 pb-0"
          onSent={() => {
            if (params?.id) void load(params.id).catch(() => {})
          }}
        />
      )}

      {detailModals}
    </div>
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
  const money = useMoney()
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
              {money.format(r.totalCostUsd)}
            </span>
          </div>
        ))}
      </div>
      <Separator className="my-2" />
      <div className="flex items-center justify-between font-semibold">
        <span>{t.history.total}</span>
        <span className="tabular-nums">{money.format(total)}</span>
      </div>
    </div>
  )
}
