"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Gavel, Loader2, MessagesSquare } from "lucide-react"

import { PageBody, Topbar } from "@/components/layout/topbar"
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
import {
  ChairmanPicker,
  MultiModelPicker,
  StatusBadge,
  modelKey,
} from "@/components/models/model-picker"
import { useModels } from "@/components/models/use-models"
import { cn, formatLatency, formatTokens, formatUsd } from "@/lib/utils"
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
  const [mode, setMode] = useState<Mode>("COUNCIL")
  const [question, setQuestion] = useState("")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [chairman, setChairman] = useState<string | null>(null)
  const [withSummary, setWithSummary] = useState(true)
  const [rounds, setRounds] = useState(2)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [runId, setRunId] = useState<string | null>(null)
  const [run, setRun] = useState<CouncilRunDto | null>(null)
  const [askedQuestion, setAskedQuestion] = useState("")
  const [participants, setParticipants] = useState<PendingSpeaker[]>([])
  const esRef = useRef<EventSource | null>(null)
  const bottomRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (models.length > 0 && selected.size === 0) {
      const usable = models.filter((m) => m.enabled && m.providerConfigured)
      setSelected(new Set(usable.map(modelKey)))
      if (!chairman && usable.length > 0) setChairman(modelKey(usable[0]))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [models])

  const refresh = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/council/${id}`)
      if (res.ok) setRun((await res.json()) as CouncilRunDto)
    } catch {
      // transient — polling continues
    }
  }, [])

  useEffect(() => {
    if (!runId) return
    void refresh(runId)
    const interval = setInterval(() => void refresh(runId), 2000)

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
    <>
      <Topbar
        title={
          mode === "DISCUSSION" ? t.council.discussionTitle : t.council.title
        }
        subtitle={
          mode === "DISCUSSION"
            ? t.council.discussionSubtitle
            : t.council.subtitle
        }
      />
      <PageBody width="narrow">
      <ModeSwitch mode={mode} onChange={setMode} disabled={active} />

      <Card>
        <CardContent className="space-y-4 p-4">
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
              <Loader2 className="h-4 w-4 animate-spin text-orange" />
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

      {run && (
        <div className="space-y-5">
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
          </div>

          <ChatTranscript
            run={run}
            question={askedQuestion}
            models={models}
            pendingSpeakers={participants}
          />

          {TERMINAL.includes(run.status) && (
            <>
              <Separator className="my-2" />
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label={t.stats.messages} value={String(run.modelRuns.length)} />
                <Stat label={t.stats.tokens} value={formatTokens(run.totalTokens)} />
                <Stat label={t.stats.cost} value={formatUsd(run.totalCostUsd)} />
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
          <div ref={bottomRef} />
        </div>
      )}
      </PageBody>
    </>
  )
}

function ModeSwitch({
  mode,
  onChange,
  disabled,
}: {
  mode: Mode
  onChange: (m: Mode) => void
  disabled: boolean
}) {
  const options: Array<{
    value: Mode
    label: string
    hint: string
  }> = [
    {
      value: "COUNCIL",
      label: t.mode.council,
      hint: t.mode.councilHint,
    },
    {
      value: "DISCUSSION",
      label: t.mode.discussion,
      hint: t.mode.discussionHint,
    },
  ]

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          disabled={disabled}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-lg border px-4 py-3 text-left transition-colors",
            mode === o.value
              ? "border-orange bg-orange-bg"
              : "border-border bg-white hover:border-orange-border hover:bg-orange-bg",
            disabled && "opacity-60"
          )}
        >
          <div
            className={cn(
              "text-[13px] font-semibold",
              mode === o.value ? "text-orange" : "text-ink"
            )}
          >
            {o.label}
          </div>
          <div className="text-[12px] text-gray-500">{o.hint}</div>
        </button>
      ))}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[16px] border border-border bg-white p-3 text-center">
      <div className="kpi-label mb-1">{label}</div>
      <div className="kpi-value text-[20px]">{value}</div>
    </div>
  )
}
