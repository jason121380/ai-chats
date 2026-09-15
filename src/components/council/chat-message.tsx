"use client"

import { AlertTriangle } from "lucide-react"

import { Markdown } from "@/components/ui/markdown"
import { cn, formatLatency, formatTokens } from "@/lib/utils"
import { useMoney } from "@/components/layout/currency-context"
import { formatTime, t } from "@/lib/i18n"
import { ROLE_LABELS, type ModelRunDto } from "@/types/api"
import { PROVIDER_MARKS, ProviderMarkIcon } from "./provider-marks"
import { speakerInitials, speakerStyle } from "./speaker"

function Avatar({
  name,
  provider,
  className,
}: {
  name: string
  provider: string
  className?: string
}) {
  const mark = PROVIDER_MARKS[provider]
  const style = speakerStyle(provider)

  // Initials are the fallback, not the design: a provider we have no mark for
  // still needs an avatar that tells it apart from the others.
  if (!mark) {
    return (
      <div
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
          style.avatar,
          className
        )}
        aria-hidden
      >
        {speakerInitials(name)}
      </div>
    )
  }

  return (
    <div
      className={cn(
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white",
        className
      )}
      style={{ backgroundColor: mark.bg }}
      title={mark.label}
    >
      <ProviderMarkIcon provider={provider} className="h-[18px] w-[18px]" />
    </div>
  )
}

/** Three bouncing dots. The only "still working" signal in the transcript. */
function TypingDots({ className }: { className?: string }) {
  return (
    <span className={cn("flex gap-1", className)} aria-label={t.transcript.typing}>
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/60"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </span>
  )
}

/** A participant's message in the transcript. */
export function ChatMessage({
  run,
  displayName,
  highlight,
}: {
  run: ModelRunDto
  displayName: string
  highlight?: boolean
}) {
  const money = useMoney()
  const style = speakerStyle(run.provider)
  const failed = run.status === "FAILED" || run.status === "TIMEOUT"
  // A row exists from the moment the turn starts, with no response yet. Without
  // this, "still generating" renders as「沒有回傳內容」— the message for a model
  // that finished and said nothing, which is a different and much worse thing.
  const inFlight = run.status === "PENDING" || run.status === "RUNNING"
  const time = run.completedAt ?? run.startedAt

  return (
    // Telegram's incoming-message shape: avatar at the bottom-left of the
    // bubble, name in the speaker's colour inside the bubble, timestamp
    // tucked into the bottom-right corner instead of sitting on its own row.
    <div className="flex items-end gap-2">
      <Avatar name={displayName} provider={run.provider} />
      <div className="min-w-0 max-w-[85%]">
        {failed ? (
          <div className="flex items-start gap-2 rounded-2xl rounded-bl-md border border-destructive/30 bg-destructive/5 px-3.5 py-2.5 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <div className="font-medium">
                {run.status === "TIMEOUT"
                  ? t.transcript.timeoutTitle
                  : t.transcript.failedTitle}
              </div>
              <div className="text-xs opacity-80">
                {run.errorCode ? `${run.errorCode}: ` : ""}
                {run.errorMessage ?? t.errors.unknown}
              </div>
              <div className="mt-1 text-xs opacity-70">
                {t.transcript.failedHint}
              </div>
            </div>
          </div>
        ) : (
          <div
            className={cn(
              "overflow-hidden rounded-2xl rounded-bl-md bg-white",
              highlight && "ring-1 ring-rose-brand"
            )}
          >
            <div className="flex">
              <div className={cn("w-1 shrink-0", style.accent)} />
              <div className="min-w-0 flex-1 px-3.5 py-2.5">
                <div className="mb-0.5 flex flex-wrap items-baseline gap-x-2">
                  <span className={cn("text-sm font-semibold", style.name)}>
                    {displayName}
                  </span>
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                    {ROLE_LABELS[run.role] ?? run.role}
                  </span>
                </div>
                {run.response ? (
                  <Markdown>{run.response}</Markdown>
                ) : inFlight ? (
                  <span className="flex items-center gap-2 text-sm text-muted-foreground">
                    <TypingDots />
                    {t.transcript.typing}
                  </span>
                ) : (
                  <p className="text-sm italic text-muted-foreground">
                    {t.transcript.noContent}
                  </p>
                )}
                {time && (
                  <div className="mt-1 text-right text-[10px] leading-none text-muted-foreground/70">
                    {formatTime(time)}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {!failed && !inFlight && (
          <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
            <span>{formatLatency(run.latencyMs)}</span>
            <span>
              {formatTokens(run.inputTokens)} / {formatTokens(run.outputTokens)}{" "}
              {t.stats.inOutTokens}
            </span>
            <span
              // An estimate is marked wherever the number appears. Unmarked,
              // it is indistinguishable from what the call was billed at.
              title={
                run.pricingStatus === "ESTIMATED"
                  ? t.settings.estimated
                  : undefined
              }
            >
              {run.pricingStatus === "MISSING" && run.totalCostUsd === null
                ? t.stats.noPrice
                : money.format(run.totalCostUsd)}
              {run.pricingStatus === "ESTIMATED" && (
                <span className="ml-1 text-amber-600">
                  ({t.settings.estimated})
                </span>
              )}
            </span>
            {run.attemptCount !== undefined && run.attemptCount > 1 && (
              <span>{t.stats.attempts(run.attemptCount)}</span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/** "X is typing…" row for a participant whose turn is in flight. */
export function ChatTyping({
  displayName,
  provider,
}: {
  displayName: string
  provider: string
}) {
  const style = speakerStyle(provider)
  return (
    <div className="flex items-center gap-3">
      <Avatar
        name={displayName}
        provider={provider}
        className="opacity-60"
      />
      <div className="flex items-center gap-2">
        <span className={cn("text-sm font-semibold opacity-70", style.name)}>
          {displayName}
        </span>
        <TypingDots />
      </div>
    </div>
  )
}

/** Phase separator: "Round 1 · independent analysis", etc. */
export function ChatDivider({
  label,
  sublabel,
}: {
  label: string
  sublabel?: string
}) {
  return (
    <div className="flex items-center gap-3 py-1">
      <div className="h-px flex-1 bg-border" />
      <div className="text-center">
        <span className="text-xs font-semibold text-muted-foreground">
          {label}
        </span>
        {sublabel && (
          <span className="ml-2 text-xs text-muted-foreground/70">
            {sublabel}
          </span>
        )}
      </div>
      <div className="h-px flex-1 bg-border" />
    </div>
  )
}

/**
 * Something the person said — the opening question, or an interjection.
 *
 * Telegram's outgoing shape: right-aligned, tinted, no avatar. Side and colour
 * are what separate "you" from the models at a glance; a label would be
 * redundant next to a bubble that is already on your side of the window.
 */
export function ChatQuestion({
  content,
  at,
}: {
  content: string
  /** Timestamp, when there is one to show. */
  at?: string | null
}) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] rounded-2xl rounded-br-md bg-rose-light/60 px-3.5 py-2.5">
        <div className="whitespace-pre-wrap text-sm text-gray-900">
          {content}
        </div>
        {at && (
          <div className="mt-1 text-right text-[10px] leading-none text-rose-dark/60">
            {formatTime(at)}
          </div>
        )}
      </div>
    </div>
  )
}

