"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Gavel, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Markdown } from "@/components/ui/markdown"
import { Separator } from "@/components/ui/separator"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { ModelRunCard } from "@/components/council/model-run-card"
import {
  ChairmanPicker,
  MultiModelPicker,
  StatusBadge,
  modelKey,
} from "@/components/models/model-picker"
import { useModels } from "@/components/models/use-models"
import { formatLatency, formatTokens, formatUsd } from "@/lib/utils"
import type { CouncilRunDto } from "@/types/api"

const TERMINAL = ["COMPLETED", "PARTIAL", "FAILED"]

export default function CouncilPage() {
  const { models, loading } = useModels()
  const [question, setQuestion] = useState("")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [chairman, setChairman] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [runId, setRunId] = useState<string | null>(null)
  const [run, setRun] = useState<CouncilRunDto | null>(null)
  const esRef = useRef<EventSource | null>(null)

  // Default selection: all enabled models with a configured provider.
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

  // Poll while the run is active; SSE events trigger immediate refreshes.
  useEffect(() => {
    if (!runId) return
    void refresh(runId)
    const interval = setInterval(() => {
      void refresh(runId)
    }, 2500)

    const es = new EventSource(`/api/council/${runId}/stream`)
    esRef.current = es
    const onAny = () => void refresh(runId)
    es.onmessage = onAny
    for (const type of [
      "council.started",
      "stage.started",
      "model.started",
      "model.completed",
      "model.failed",
      "stage.completed",
      "chairman.started",
      "chairman.completed",
      "council.completed",
      "council.failed",
    ]) {
      es.addEventListener(type, onAny)
    }
    es.onerror = () => {
      es.close()
    }

    return () => {
      clearInterval(interval)
      es.close()
    }
  }, [runId, refresh])

  useEffect(() => {
    if (run && TERMINAL.includes(run.status)) {
      esRef.current?.close()
    }
  }, [run])

  const start = async () => {
    setError(null)
    if (!question.trim()) {
      setError("Enter a question for the council.")
      return
    }
    if (selected.size === 0 || !chairman) {
      setError("Select at least one model and a chairman.")
      return
    }
    setStarting(true)
    setRun(null)
    try {
      const toSelection = (key: string) => {
        const [provider, ...rest] = key.split("/")
        return { provider, modelId: rest.join("/") }
      }
      const res = await fetch("/api/council", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: question,
          models: Array.from(selected).map(toSelection),
          chairman: toSelection(chairman),
        }),
      })
      const data = (await res.json()) as { runId?: string; error?: string }
      if (!res.ok || !data.runId) {
        throw new Error(data.error ?? "Failed to start council")
      }
      setRunId(data.runId)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setStarting(false)
    }
  }

  const active = run && !TERMINAL.includes(run.status)
  const roundOneRuns = run?.modelRuns.filter((r) => r.stage === "ROUND_1") ?? []
  const critiqueRuns = run?.modelRuns.filter((r) => r.stage === "CRITIQUE") ?? []
  const chairmanRun = run?.modelRuns.find((r) => r.stage === "CHAIRMAN")

  const pendingSelections = Array.from(selected).map((key) => {
    const [provider, ...rest] = key.split("/")
    return { provider, modelId: rest.join("/") }
  })

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Ask the Council</h1>
        <p className="text-sm text-muted-foreground">
          One question. Independent analysis, anonymous critique, and a
          chairman decision.
        </p>
      </div>

      <Card>
        <CardContent className="space-y-4 p-4">
          <Textarea
            placeholder="e.g. Should we invest in opening salons in Vietnam next year?"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            rows={4}
            disabled={Boolean(active)}
          />
          <div>
            <p className="mb-2 text-sm font-medium">Council members</p>
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
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="mb-2 text-sm font-medium">Chairman</p>
              <ChairmanPicker
                models={models}
                value={chairman}
                onChange={setChairman}
              />
            </div>
            <Button onClick={start} disabled={starting || Boolean(active)}>
              {starting || active ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Gavel className="mr-2 h-4 w-4" />
              )}
              {active ? "Council in session…" : "Start Council"}
            </Button>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>

      {run && (
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <StatusBadge status={run.status} />
            {run.currentStage && !TERMINAL.includes(run.status) && (
              <span className="text-sm text-muted-foreground">
                Stage: {run.currentStage}
              </span>
            )}
            {run.errorMessage && (
              <span className="text-sm text-destructive">
                {run.errorMessage}
              </span>
            )}
          </div>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Round 1 · Independent analysis</h2>
            {pendingSelections.map((sel) => {
              const matched = roundOneRuns.find(
                (r) => r.provider === sel.provider && r.modelId === sel.modelId
              )
              return (
                <ModelRunCard
                  key={`${sel.provider}/${sel.modelId}`}
                  run={matched}
                  pending={sel}
                />
              )
            })}
          </section>

          {critiqueRuns.length > 0 && (
            <Collapsible defaultOpen={false}>
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">
                  Round 2 · Critique{" "}
                  <span className="text-sm font-normal text-muted-foreground">
                    ({critiqueRuns.length} models)
                  </span>
                </h2>
                <CollapsibleTrigger asChild>
                  <Button variant="outline" size="sm">
                    Toggle
                  </Button>
                </CollapsibleTrigger>
              </div>
              <CollapsibleContent className="mt-3 space-y-3">
                {critiqueRuns.map((r) => (
                  <ModelRunCard key={r.id} run={r} />
                ))}
              </CollapsibleContent>
            </Collapsible>
          )}

          {(chairmanRun || run.finalAnswer) && (
            <section className="space-y-3">
              <h2 className="text-lg font-semibold">Chairman decision</h2>
              {run.finalAnswer ? (
                <Card className="border-primary/40">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center justify-between text-base">
                      <span>
                        {chairmanRun?.modelId ?? run.chairmanModel} ·{" "}
                        Final Recommendation
                      </span>
                      {chairmanRun && (
                        <span className="text-xs font-normal text-muted-foreground">
                          {formatTokens(chairmanRun.totalTokens)} tokens ·{" "}
                          {formatUsd(chairmanRun.totalCostUsd)} ·{" "}
                          {formatLatency(chairmanRun.latencyMs)}
                        </span>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Markdown>{run.finalAnswer}</Markdown>
                  </CardContent>
                </Card>
              ) : (
                chairmanRun && <ModelRunCard run={chairmanRun} />
              )}
            </section>
          )}

          {TERMINAL.includes(run.status) && (
            <section>
              <Separator className="my-4" />
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Stat label="Calls" value={String(run.modelRuns.length)} />
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
            </section>
          )}
        </div>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-background p-4 text-center">
      <div className="text-xl font-bold">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  )
}
