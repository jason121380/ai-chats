"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { FileText, Gavel, Loader2, MessagesSquare, X } from "lucide-react"

import { PageShell } from "@/components/layout/page-shell"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import {
  ChatTranscript,
  type PendingSpeaker,
} from "@/components/council/chat-transcript"
import { DiscussionComposer } from "@/components/council/discussion-composer"
import { StopRunButton } from "@/components/council/stop-run-button"
import { Markdown } from "@/components/ui/markdown"
import {
  ChairmanPicker,
  MultiModelPicker,
  StatusBadge,
  modelKey,
} from "@/components/models/model-picker"
import { useModels } from "@/components/models/use-models"
import { formatLatency, formatTokens } from "@/lib/utils"
import { useMoney } from "@/components/layout/currency-context"
import { stageLabel, t } from "@/lib/i18n"
import type { CouncilRunDto } from "@/types/api"

const TERMINAL = ["COMPLETED", "PARTIAL", "FAILED"]

type Mode = "COUNCIL" | "DISCUSSION"

function parseKey(key: string) {
  const [provider, ...rest] = key.split("/")
  return { provider, modelId: rest.join("/") }
}

export default function CouncilPage() {
  const { models, loading } = useModels()
  const money = useMoney()
  const [mode, setMode] = useState<Mode>("COUNCIL")
  const [question, setQuestion] = useState("")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [chairman, setChairman] = useState<string | null>(null)
  const [withSummary, setWithSummary] = useState(true)
  const [rounds, setRounds] = useState(2)
  const [style, setStyle] = useState<"COLLABORATIVE" | "DEBATE">(
    "COLLABORATIVE"
  )
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [runId, setRunId] = useState<string | null>(null)
  const [run, setRun] = useState<CouncilRunDto | null>(null)
  const [askedQuestion, setAskedQuestion] = useState("")
  const [participants, setParticipants] = useState<PendingSpeaker[]>([])
  const esRef = useRef<EventSource | null>(null)
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const [summaryOpen, setSummaryOpen] = useState(false)

  useEffect(() => {
    if (models.length > 0 && selected.size === 0) {
      const usable = models.filter((m) => m.enabled && m.providerConfigured)
      setSelected(new Set(usable.map(modelKey)))
      if (!chairman && usable.length > 0) setChairman(modelKey(usable[0]))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [models])

  // One request at a time. The interval fires on a schedule, not on
  // completion, and the SSE listener below calls this too — on a slow
  // connection that stacks several identical reads of the same run, each
  // queued behind the last.
  const inFlight = useRef(false)

  const refresh = useCallback(async (id: string) => {
    if (inFlight.current) return
    inFlight.current = true
    try {
      const res = await fetch(`/api/council/${id}`)
      if (res.ok) setRun((await res.json()) as CouncilRunDto)
    } catch {
      // transient — polling continues
    } finally {
      inFlight.current = false
    }
  }, [])

  useEffect(() => {
    if (!runId) return
    void refresh(runId)
    // One second, not two: the poll interval is how often the streamed text
    // reaches the browser, and the reveal above drains its buffer faster than
    // that — a longer gap shows as a pause between blocks.
    const interval = setInterval(() => {
      // A backgrounded phone browser should not spend data on a request a
      // second for a screen nobody is looking at.
      if (document.hidden) return
      void refresh(runId)
    }, 1000)

    const es = new EventSource(`/api/council/${runId}/stream`)
    esRef.current = es
    const onAny = () => void refresh(runId)
    es.onmessage = onAny
    for (const type of [
      "council.started",
      "stage.started",
      "round.started",
      "model.started",
      "model.completed",
      "model.failed",
      "round.completed",
      "stage.completed",
      "chairman.started",
      "chairman.completed",
      "council.completed",
      "council.failed",
    ]) {
      es.addEventListener(type, onAny)
    }
    es.onerror = () => es.close()

    return () => {
      clearInterval(interval)
      es.close()
    }
  }, [runId, refresh])

  useEffect(() => {
    if (run && TERMINAL.includes(run.status)) esRef.current?.close()
  }, [run])

  // Follow the conversation as new messages arrive.
  useEffect(() => {
    if (run && !TERMINAL.includes(run.status)) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
    }
  }, [run])

  const start = async () => {
    setError(null)
    if (!question.trim()) {
      setError(t.errors.enterQuestion)
      return
    }
    const minModels = mode === "DISCUSSION" ? 2 : 1
    if (selected.size < minModels) {
      setError(
        mode === "DISCUSSION"
          ? t.errors.selectTwo
          : t.errors.selectModel
      )
      return
    }
    if (mode === "COUNCIL" && !chairman) {
      setError(t.errors.selectChairman)
      return
    }
    if (mode === "DISCUSSION" && withSummary && !chairman) {
      setError(t.errors.selectSummarizer)
      return
    }

    setStarting(true)
    setRun(null)
    setRunId(null)
    const asked = question
    const chosen = Array.from(selected).map(parseKey)
    setAskedQuestion(asked)
    setParticipants(chosen)

    try {
      const endpoint = mode === "DISCUSSION" ? "/api/discussion" : "/api/council"
      const body =
        mode === "DISCUSSION"
          ? {
              message: asked,
              participants: chosen,
              rounds,
              style,
              summarizer:
                withSummary && chairman ? parseKey(chairman) : null,
            }
          : {
              message: asked,
              models: chosen,
              chairman: parseKey(chairman!),
            }

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = (await res.json()) as { runId?: string; error?: string }
      if (!res.ok || !data.runId) {
        throw new Error(data.error ?? t.errors.startFailed)
      }
      setRunId(data.runId)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setStarting(false)
    }
  }

  const active = Boolean(run && !TERMINAL.includes(run.status)) || starting

  return (
    <PageShell
      width="full"
      title={mode === "DISCUSSION" ? t.council.discussionTitle : t.council.title}
      description={
        mode === "DISCUSSION"
          ? t.council.discussionSubtitle
          : t.council.subtitle
      }
      actions={
        run ? (
          <Button
            variant="outline"
            onClick={() => setSummaryOpen(true)}
            disabled={!run.finalAnswer}
            title={run.finalAnswer ? undefined : t.discussion.summaryPending}
          >
            <FileText size={15} />
            {t.discussion.summary}
          </Button>
        ) : undefined
      }
    >
      {/* Settings on the left, the meeting on the right. The settings
          column stays put while the transcript scrolls, so a running
          meeting never pushes its own controls out of reach; below lg the
          two stack, settings first, as before. */}
      <div className="grid gap-6 lg:grid-cols-[minmax(340px,420px)_minmax(0,1fr)] lg:items-start">
      <div className="space-y-6 lg:sticky lg:top-6">
      <Card>
        <CardContent className="space-y-4 p-4">
          <ModeSwitch mode={mode} onChange={setMode} disabled={active} />

          <Textarea
            placeholder={
              mode === "DISCUSSION"
                ? t.council.questionPlaceholderDiscussion
                : t.council.questionPlaceholder
            }
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            rows={3}
            disabled={active}
          />

          <div>
            <p className="mb-2 text-sm font-medium">
              {mode === "DISCUSSION"
                ? t.council.participants
                : t.council.members}
            </p>
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin text-rose-brand" />
            ) : (
              <MultiModelPicker
                models={models}
                selected={selected}
                onToggle={(key) =>
                  setSelected((prev) => {
                    const next = new Set(prev)
                    if (next.has(key)) next.delete(key)
                    else next.add(key)
                    return next
                  })
                }
              />
            )}
          </div>

          {mode === "DISCUSSION" && (
            <div className="flex flex-wrap items-center gap-6">
              <div>
                <p className="mb-2 text-sm font-medium">{t.council.style}</p>
                <div className="flex gap-1">
                  {(
                    [
                      ["COLLABORATIVE", t.council.styleCollaborative],
                      ["DEBATE", t.council.styleDebate],
                    ] as const
                  ).map(([value, label]) => (
                    <Button
                      key={value}
                      size="sm"
                      variant={style === value ? "default" : "outline"}
                      onClick={() => setStyle(value)}
                      disabled={active}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {style === "DEBATE"
                    ? t.council.styleDebateHint
                    : t.council.styleCollaborativeHint}
                </p>
              </div>
              <div>
                <p className="mb-2 text-sm font-medium">{t.council.rounds}</p>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <Button
                      key={n}
                      size="sm"
                      variant={rounds === n ? "default" : "outline"}
                      className="h-8 w-9 p-0"
                      onClick={() => setRounds(n)}
                      disabled={active}
                    >
                      {n}
                    </Button>
                  ))}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t.council.roundsEstimate(selected.size, rounds)}
                </p>
              </div>
              <div className="flex items-center gap-2 pt-6">
                <Switch
                  id="with-summary"
                  checked={withSummary}
                  onCheckedChange={setWithSummary}
                  disabled={active}
                />
                <Label htmlFor="with-summary" className="cursor-pointer">
                  {t.council.withSummary}
                </Label>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="mb-2 text-sm font-medium">
                {mode === "DISCUSSION"
                  ? t.council.summarizer
                  : t.council.chairman}
              </p>
              <ChairmanPicker
                models={models}
                value={chairman}
                onChange={setChairman}
              />
            </div>
            <Button onClick={start} disabled={active}>
              {active ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : mode === "DISCUSSION" ? (
                <MessagesSquare className="mr-2 h-4 w-4" />
              ) : (
                <Gavel className="mr-2 h-4 w-4" />
              )}
              {active
                ? mode === "DISCUSSION"
                  ? t.council.runningDiscussion
                  : t.council.running
                : mode === "DISCUSSION"
                  ? t.council.startDiscussion
                  : t.council.start}
            </Button>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>
      </div>

      <div className="min-w-0 space-y-5">
      {run ? (
        <>
          <div className="flex items-center gap-3">
            <StatusBadge status={run.status} />
            {!TERMINAL.includes(run.status) && (
              <span className="text-sm text-muted-foreground">
                {run.kind === "DISCUSSION" && run.currentRound
                  ? t.council.roundProgress(
                      run.currentRound,
                      run.totalRounds ?? run.currentRound
                    )
                  : run.currentStage
                    ? t.council.stage(stageLabel(run.currentStage))
                    : t.council.starting}
              </span>
            )}
            {run.errorMessage && (
              <span className="text-sm text-destructive">
                {run.errorMessage}
              </span>
            )}
            {!TERMINAL.includes(run.status) && (
              <StopRunButton
                runId={run.id}
                onStopped={() => void refresh(run.id)}
              />
            )}
          </div>

          {/* A chat window, not a page section: the transcript owns its own
              scroll so the composer stays reachable while a long meeting
              runs, instead of being pushed below the fold. */}
          <div className="rounded-lg border border-gray-200 bg-white">
            <div className="max-h-[min(70vh,640px)] space-y-4 overflow-y-auto rounded-t-lg bg-gray-50 p-4 pb-24 lg:max-h-[calc(100dvh-14rem)]">
              <ChatTranscript
                run={run}
                question={askedQuestion}
                models={models}
                pendingSpeakers={participants}
                showSummary={false}
              />
              <div ref={bottomRef} />
            </div>
            {run.kind === "DISCUSSION" && (
              <DiscussionComposer
                runId={run.id}
                finished={TERMINAL.includes(run.status)}
                // A finished meeting is continued from its history page,
                // where the transcript is the page. Offering it here too
                // would leave the starting form sitting above a meeting that
                // had quietly restarted underneath it.
                canContinue={false}
                onSent={() => {
                  void refresh(run.id)
                }}
              />
            )}
          </div>

          {TERMINAL.includes(run.status) && (
            <>
              <Separator className="my-2" />
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label={t.stats.messages} value={String(run.modelRuns.length)} />
                <Stat label={t.stats.tokens} value={formatTokens(run.totalTokens)} />
                <Stat label={t.stats.cost} value={money.format(run.totalCostUsd)} />
                <Stat
                  label={t.stats.wallTime}
                  value={
                    run.startedAt && run.completedAt
                      ? formatLatency(
                          new Date(run.completedAt).getTime() -
                            new Date(run.startedAt).getTime()
                        )
                      : "—"
                  }
                />
              </div>
            </>
          )}
        </>
      ) : (
        <div className="flex min-h-[240px] items-center justify-center rounded-lg border border-dashed border-gray-200 bg-white p-6 text-sm text-gray-400">
          {t.council.transcriptEmpty}
        </div>
      )}
      </div>
      </div>

      <SummaryModal
        open={summaryOpen}
        onClose={() => setSummaryOpen(false)}
        content={run?.finalAnswer ?? null}
      />
    </PageShell>
  )
}

/**
 * The closing summary, behind the 會議總結 button rather than appended to the
 * transcript. The meeting is a chat; a long structured report inside the chat
 * scroll buries the last thing anyone actually said.
 */
function SummaryModal({
  open,
  onClose,
  content,
}: {
  open: boolean
  onClose: () => void
  content: string | null
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKey)
    document.body.style.overflow = "hidden"
    return () => {
      document.removeEventListener("keydown", onKey)
      document.body.style.overflow = ""
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 py-10"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t.discussion.summary}
        className="w-full max-w-2xl rounded-lg border border-gray-200 bg-white"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-gray-100 px-5 py-3">
          <Gavel className="h-4 w-4 text-rose-brand" />
          <h2 className="text-base font-semibold text-gray-900">
            {t.discussion.summary}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="關閉"
            className="ml-auto text-gray-400 transition-colors hover:text-gray-700"
          >
            <X size={18} />
          </button>
        </div>
        <div className="px-5 py-4">
          {content ? (
            <Markdown>{content}</Markdown>
          ) : (
            <p className="text-sm text-gray-400">
              {t.discussion.summaryPending}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * The two ways a meeting can be run, as the same segmented control as
 * 合作/辯論 below it. It was a pair of description cards; at the top of a
 * settings column they cost more height than the choice is worth, and the
 * difference between the two is already in the page title and subtitle.
 */
function ModeSwitch({
  mode,
  onChange,
  disabled,
}: {
  mode: Mode
  onChange: (m: Mode) => void
  disabled: boolean
}) {
  return (
    <div className="flex gap-1">
      {(
        [
          ["COUNCIL", t.mode.council],
          ["DISCUSSION", t.mode.discussion],
        ] as const
      ).map(([value, label]) => (
        <Button
          key={value}
          size="sm"
          variant={mode === value ? "default" : "outline"}
          onClick={() => onChange(value)}
          disabled={disabled}
        >
          {label}
        </Button>
      ))}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 text-center">
      <div className="text-xs font-medium text-gray-500">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums text-gray-900">
        {value}
      </div>
    </div>
  )
}
