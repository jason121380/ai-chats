"use client"

import { useState } from "react"
import { Loader2, Send } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Markdown } from "@/components/ui/markdown"
import { PageBody, Topbar } from "@/components/layout/topbar"
import { ModelRunCard } from "@/components/council/model-run-card"
import { MultiModelPicker, modelKey } from "@/components/models/model-picker"
import { useModels } from "@/components/models/use-models"
import { formatLatency, formatTokens, formatUsd } from "@/lib/utils"
import { t } from "@/lib/i18n"
import { PROVIDER_LABELS, type ModelRunDto } from "@/types/api"

interface ChatTurn {
  role: "user" | "assistant"
  content: string
  meta?: string
}

function parseKey(key: string) {
  const [provider, ...rest] = key.split("/")
  return { provider, modelId: rest.join("/") }
}

export default function NewChatPage() {
  const { models, loading } = useModels()

  return (
    <>
      <Topbar title={t.chat.title} subtitle={t.chat.subtitle} />
      <PageBody width="narrow" className="max-w-4xl">
        <Tabs defaultValue="solo">
          <TabsList>
            <TabsTrigger value="solo">{t.chat.solo}</TabsTrigger>
            <TabsTrigger value="compare">{t.chat.compare}</TabsTrigger>
          </TabsList>
          <TabsContent value="solo">
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin text-orange" />
            ) : (
              <SoloChat models={models} />
            )}
          </TabsContent>
          <TabsContent value="compare">
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin text-orange" />
            ) : (
              <Compare models={models} />
            )}
          </TabsContent>
        </Tabs>
      </PageBody>
    </>
  )
}

function SoloChat({
  models,
}: {
  models: ReturnType<typeof useModels>["models"]
}) {
  const usable = models.filter((m) => m.enabled)
  const [model, setModel] = useState<string | null>(
    usable.length > 0 ? modelKey(usable[0]) : null
  )
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [turns, setTurns] = useState<ChatTurn[]>([])
  const [input, setInput] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const send = async () => {
    if (!input.trim() || !model) return
    setError(null)
    setBusy(true)
    const message = input
    setTurns((prev) => [...prev, { role: "user", content: message }])
    setInput("")
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: sessionId ?? undefined,
          message,
          model: parseKey(model),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? t.errors.requestFailed)
      setSessionId(data.sessionId)
      if (data.message) {
        const mr = data.modelRun as ModelRunDto
        setTurns((prev) => [
          ...prev,
          {
            role: "assistant",
            content: data.message.content,
            meta: `${mr.modelId} · ${formatTokens(mr.totalTokens)} Token · ${formatUsd(
              mr.totalCostUsd
            )} · ${formatLatency(mr.latencyMs)}`,
          },
        ])
      } else {
        const mr = data.modelRun as ModelRunDto
        setError(
          `${mr.status}: ${mr.errorMessage ?? t.errors.requestFailed}`
        )
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Select value={model ?? undefined} onValueChange={setModel}>
          <SelectTrigger className="w-72">
            <SelectValue placeholder={t.chat.selectModel} />
          </SelectTrigger>
          <SelectContent>
            {usable.map((m) => (
              <SelectItem key={modelKey(m)} value={modelKey(m)}>
                {m.displayName} ({PROVIDER_LABELS[m.provider] ?? m.provider})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {sessionId && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setSessionId(null)
              setTurns([])
            }}
          >
            {t.chat.newConversation}
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="space-y-3 p-4">
          {turns.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {t.chat.emptyState}
            </p>
          )}
          {turns.map((turn, i) => (
            <div
              key={i}
              className={
                turn.role === "user"
                  ? "ml-auto max-w-[85%] rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground"
                  : "mr-auto max-w-[85%] rounded-lg border bg-muted/40 px-3 py-2 text-sm"
              }
            >
              {turn.role === "user" ? (
                <div className="whitespace-pre-wrap">{turn.content}</div>
              ) : (
                <Markdown>{turn.content}</Markdown>
              )}
              {turn.meta && (
                <div className="mt-1 text-[10px] opacity-70">{turn.meta}</div>
              )}
            </div>
          ))}
          {busy && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin text-orange" /> {t.chat.thinking}
            </div>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Textarea
          rows={2}
          placeholder={t.chat.inputPlaceholder}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              void send()
            }
          }}
        />
        <Button
          size="icon"
          onClick={send}
          disabled={busy || !input.trim()}
          aria-label={t.chat.send}
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

function Compare({
  models,
}: {
  models: ReturnType<typeof useModels>["models"]
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [question, setQuestion] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<ModelRunDto[] | null>(null)

  const start = async () => {
    if (!question.trim() || selected.size === 0) {
      setError(t.errors.enterQuestion)
      return
    }
    setError(null)
    setBusy(true)
    setResults(null)
    try {
      const res = await fetch("/api/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: question,
          models: Array.from(selected).map(parseKey),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? t.errors.requestFailed)
      setResults(data.results as ModelRunDto[])
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <Textarea
        rows={3}
        placeholder={t.chat.comparePlaceholder}
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
      />
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
      <Button onClick={start} disabled={busy}>
        {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {t.chat.compare_}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {results && (
        <div className="space-y-3">
          {results.map((r, i) => (
            <ModelRunCard key={r.id ?? i} run={r} />
          ))}
        </div>
      )}
    </div>
  )
}
