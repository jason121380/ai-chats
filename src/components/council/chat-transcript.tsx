"use client"

import { useMemo } from "react"
import { Gavel } from "lucide-react"

import { Markdown } from "@/components/ui/markdown"
import { formatLatency, formatTokens, formatUsd } from "@/lib/utils"
import { t } from "@/lib/i18n"
import type { CouncilRunDto, ModelConfigDto, ModelRunDto } from "@/types/api"
import {
  ChatDivider,
  ChatMessage,
  ChatQuestion,
  ChatTyping,
} from "./chat-message"

export interface PendingSpeaker {
  provider: string
  modelId: string
}

/**
 * Renders a council or discussion run as a group-chat transcript.
 *
 * COUNCIL:    Round 1 → Critique → Chairman, as phase-separated sections.
 * DISCUSSION: one section per speaking round, messages in speaking order.
 */
export function ChatTranscript({
  run,
  question,
  models,
  pendingSpeakers = [],
}: {
  run: CouncilRunDto
  question: string
  models: ModelConfigDto[]
  /** Participants selected for this run, so we can show them before they speak. */
  pendingSpeakers?: PendingSpeaker[]
}) {
  const nameFor = useMemo(() => {
    const byKey = new Map(
      models.map((m) => [`${m.provider}/${m.modelId}`, m.displayName])
    )
    return (provider: string, modelId: string) =>
      byKey.get(`${provider}/${modelId}`) ?? modelId
  }, [models])

  const isDiscussion = run.kind === "DISCUSSION"
  const active = !["COMPLETED", "PARTIAL", "FAILED"].includes(run.status)

  const byStage = (stage: string) =>
    run.modelRuns.filter((r) => r.stage === stage)

  const chairmanRun = run.modelRuns.find((r) => r.stage === "CHAIRMAN")

  /** Participants that have not produced a message in this stage yet. */
  const awaiting = (done: ModelRunDto[]) =>
    pendingSpeakers.filter(
      (p) =>
        !done.some(
          (r) => r.provider === p.provider && r.modelId === p.modelId
        )
    )

  return (
    <div className="space-y-5">
      <ChatQuestion content={question} />

      {isDiscussion ? (
        <DiscussionBody
          run={run}
          nameFor={nameFor}
          pendingSpeakers={pendingSpeakers}
          active={active}
        />
      ) : (
        <CouncilBody
          run={run}
          nameFor={nameFor}
          byStage={byStage}
          awaiting={awaiting}
          active={active}
        />
      )}

      {run.finalAnswer && (
        <>
          <ChatDivider
            label={
              isDiscussion ? t.transcript.closingSummary : t.transcript.chairman
            }
            sublabel={
              chairmanRun
                ? `${nameFor(chairmanRun.provider, chairmanRun.modelId)}`
                : undefined
            }
          />
          <div className="rounded-lg border border-primary/40 bg-background shadow-sm">
            <div className="flex items-center gap-2 border-b bg-primary/5 px-4 py-2">
              <Gavel className="h-4 w-4" />
              <span className="text-sm font-semibold">
                {isDiscussion
                  ? t.transcript.closingSummary
                  : t.transcript.finalRecommendation}
              </span>
              {chairmanRun && (
                <span className="ml-auto text-xs text-muted-foreground">
                  {formatTokens(chairmanRun.totalTokens)} Token ·{" "}
                  {formatUsd(chairmanRun.totalCostUsd)} ·{" "}
                  {formatLatency(chairmanRun.latencyMs)}
                </span>
              )}
            </div>
            <div className="px-4 py-3">
              <Markdown>{run.finalAnswer}</Markdown>
            </div>
          </div>
        </>
      )}

      {chairmanRun &&
        !run.finalAnswer &&
        (chairmanRun.status === "FAILED" ||
          chairmanRun.status === "TIMEOUT") && (
          <>
            <ChatDivider
              label={
                isDiscussion
                  ? t.transcript.closingSummary
                  : t.transcript.chairman
              }
            />
            <ChatMessage
              run={chairmanRun}
              displayName={nameFor(
                chairmanRun.provider,
                chairmanRun.modelId
              )}
            />
          </>
        )}
    </div>
  )
}

function CouncilBody({
  run,
  nameFor,
  byStage,
  awaiting,
  active,
}: {
  run: CouncilRunDto
  nameFor: (provider: string, modelId: string) => string
  byStage: (stage: string) => ModelRunDto[]
  awaiting: (done: ModelRunDto[]) => PendingSpeaker[]
  active: boolean
}) {
  const roundOne = byStage("ROUND_1")
  const critique = byStage("CRITIQUE")
  const roundOneWaiting = active ? awaiting(roundOne) : []
  const critiqueStarted = critique.length > 0 || run.status === "CRITIQUE"

  return (
    <>
      <ChatDivider
        label={t.transcript.round1}
        sublabel={t.transcript.round1Hint}
      />
      {roundOne.map((r) => (
        <ChatMessage
          key={r.id}
          run={r}
          displayName={nameFor(r.provider, r.modelId)}
        />
      ))}
      {roundOneWaiting.map((p) => (
        <ChatTyping
          key={`${p.provider}/${p.modelId}`}
          displayName={nameFor(p.provider, p.modelId)}
          provider={p.provider}
        />
      ))}

      {critiqueStarted && (
        <>
          <ChatDivider
            label={t.transcript.critique}
            sublabel={t.transcript.critiqueHint}
          />
          {critique.map((r) => (
            <ChatMessage
              key={r.id}
              run={r}
              displayName={nameFor(r.provider, r.modelId)}
            />
          ))}
          {active &&
            critique.length === 0 &&
            roundOne
              .filter((r) => r.status === "COMPLETED")
              .map((r) => (
                <ChatTyping
                  key={`critique-${r.id}`}
                  displayName={nameFor(r.provider, r.modelId)}
                  provider={r.provider}
                />
              ))}
        </>
      )}
    </>
  )
}

function DiscussionBody({
  run,
  nameFor,
  pendingSpeakers,
  active,
}: {
  run: CouncilRunDto
  nameFor: (provider: string, modelId: string) => string
  pendingSpeakers: PendingSpeaker[]
  active: boolean
}) {
  const turns = run.modelRuns
    .filter((r) => r.stage === "DISCUSSION")
    .sort(
      (a, b) =>
        (a.roundNumber ?? 0) - (b.roundNumber ?? 0) ||
        (a.turnIndex ?? 0) - (b.turnIndex ?? 0)
    )

  const totalRounds = run.totalRounds ?? 1
  const currentRound = run.currentRound ?? 1

  // Round numbers come from the data as well as from totalRounds, so a turn is
  // never silently dropped from the transcript because its round is unexpected.
  const roundOf = (turn: ModelRunDto) => turn.roundNumber ?? 1
  const rounds = Array.from(
    new Set<number>([
      ...Array.from({ length: totalRounds }, (_, i) => i + 1),
      ...turns.map(roundOf),
    ])
  ).sort((a, b) => a - b)

  return (
    <>
      {rounds.map((roundNumber) => {
        const roundTurns = turns.filter((turn) => roundOf(turn) === roundNumber)
        // Don't render a heading for rounds that haven't started.
        if (roundTurns.length === 0 && (!active || roundNumber > currentRound)) {
          return null
        }

        const spoken = new Set(
          roundTurns.map((turn) => `${turn.provider}/${turn.modelId}`)
        )
        const waiting =
          active && roundNumber === currentRound
            ? pendingSpeakers.filter(
                (p) => !spoken.has(`${p.provider}/${p.modelId}`)
              )
            : []

        return (
          <div key={roundNumber} className="space-y-5">
            <ChatDivider
              label={t.transcript.round(roundNumber)}
              sublabel={
                roundNumber === 1 && totalRounds > 1
                  ? t.transcript.roundOpening
                  : roundNumber === totalRounds
                    ? t.transcript.roundFinal
                    : t.transcript.roundMiddle
              }
            />
            {roundTurns.map((turn) => (
              <ChatMessage
                key={turn.id}
                run={turn}
                displayName={nameFor(turn.provider, turn.modelId)}
              />
            ))}
            {/* Discussion turns are sequential, so only the next speaker is typing. */}
            {waiting.slice(0, 1).map((p) => (
              <ChatTyping
                key={`${p.provider}/${p.modelId}`}
                displayName={nameFor(p.provider, p.modelId)}
                provider={p.provider}
              />
            ))}
          </div>
        )
      })}
    </>
  )
}
