"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Gavel, Loader2, MessagesSquare } from "lucide-react"

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
      setError("Enter a question first.")
      return
    }
    const minModels = mode === "DISCUSSION" ? 2 : 1
    if (selected.size < minModels) {
      setError(
        mode === "DISCUSSION"
          ? "A discussion needs at least two participants."
          : "Select at least one model."
      )
      return
    }
    if (mode === "COUNCIL" && !chairman) {
      setError("Select a chairman.")
      return
    }
    if (mode === "DISCUSSION" && withSummary && !chairman) {
      setError("Select who writes the closing summary, or turn it off.")
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
        throw new Error(data.error ?? "Failed to start")
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
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {mode === "DISCUSSION" ? "Group Discussion" : "Ask the Council"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {mode === "DISCUSSION"
            ? "Models take turns in one room, see each other, and argue it out."
            : "Each model analyzes alone, critiques the others anonymously, then a chairman decides."}
        </p>
      </div>

      <ModeSwitch mode={mode} onChange={setMode} disabled={active} />

      <Card>
        <CardContent className="space-y-4 p-4">
          <Textarea
            placeholder={
              mode === "DISCUSSION"
                ? "e.g. Should we open salons in Vietnam next year? Let them argue."
                : "e.g. Should we invest in opening salons in Vietnam next year?"
            }
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            rows={3}
            disabled={active}
          />

          <div>
            <p className="mb-2 text-sm font-medium">
              {mode === "DISCUSSION" ? "Participants" : "Council members"}
            </p>
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
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
                <p className="mb-2 text-sm font-medium">Speaking rounds</p>
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
                  {selected.size} participants × {rounds} rounds ={" "}
                  {selected.size * rounds} messages
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
                  Closing summary
                </Label>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="mb-2 text-sm font-medium">
                {mode === "DISCUSSION" ? "Summary written by" : "Chairman"}
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
                  ? "Meeting in progress…"
                  : "Council in session…"
                : mode === "DISCUSSION"
                  ? "Start Discussion"
                  : "Start Council"}
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
                  ? `Round ${run.currentRound} of ${run.totalRounds}`
                  : run.currentStage
                    ? `Stage: ${run.currentStage}`
                    : "Starting…"}
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
                <Stat label="Messages" value={String(run.modelRuns.length)} />
                <Stat label="Tokens" value={formatTokens(run.totalTokens)} />
                <Stat label="Cost" value={formatUsd(run.totalCostUsd)} />
                <Stat
                  label="Wall time"
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
    </div>
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
      label: "Council",
      hint: "Independent first, then anonymous critique. No anchoring.",
    },
    {
      value: "DISCUSSION",
      label: "Discussion",
      hint: "Everyone in one room, taking turns, reacting to each other.",
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
              ? "border-primary bg-primary/5"
              : "hover:bg-accent",
            disabled && "opacity-60"
          )}
        >
          <div className="text-sm font-semibold">{o.label}</div>
          <div className="text-xs text-muted-foreground">{o.hint}</div>
        </button>
      ))}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-background p-3 text-center">
      <div className="text-lg font-bold">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  )
}
