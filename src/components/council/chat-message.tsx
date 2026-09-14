"use client"

import { AlertTriangle } from "lucide-react"

import { Markdown } from "@/components/ui/markdown"
import { cn, formatLatency, formatTokens, formatUsd } from "@/lib/utils"
import { formatTime, t } from "@/lib/i18n"
import { ROLE_LABELS, type ModelRunDto } from "@/types/api"
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
  const style = speakerStyle(provider)
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
  const style = speakerStyle(run.provider)
  const failed = run.status === "FAILED" || run.status === "TIMEOUT"
  const time = run.completedAt ?? run.startedAt

  return (
    <div className="flex gap-3">
      <Avatar name={displayName} provider={run.provider} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className={cn("text-sm font-semibold", style.name)}>
            {displayName}
          </span>
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            {ROLE_LABELS[run.role] ?? run.role}
          </span>
          {time && (
            <span className="text-[11px] text-muted-foreground">
              {formatTime(time)}
            </span>
          )}
        </div>

        {failed ? (
          <div className="mt-1 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
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
              "mt-1 overflow-hidden rounded-lg border bg-background",
              highlight && "border-primary/40 shadow-sm"
            )}
          >
            <div className="flex">
              <div className={cn("w-1 shrink-0", style.accent)} />
              <div className="min-w-0 flex-1 px-3 py-2.5">
                {run.response ? (
                  <Markdown>{run.response}</Markdown>
                ) : (
                  <p className="text-sm italic text-muted-foreground">
                    {t.transcript.noContent}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {!failed && (
          <div className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-muted-foreground">
            <span>{formatLatency(run.latencyMs)}</span>
            <span>
              {formatTokens(run.inputTokens)} / {formatTokens(run.outputTokens)}{" "}
              {t.stats.inOutTokens}
            </span>
            <span>
              {run.pricingStatus === "MISSING" && run.totalCostUsd === null
                ? t.stats.noPrice
                : formatUsd(run.totalCostUsd)}
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
        <span className="flex gap-1" aria-label="typing">
          {[0, 150, 300].map((delay) => (
            <span
              key={delay}
              className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/60"
              style={{ animationDelay: `${delay}ms` }}
            />
          ))}
        </span>
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

/** The person's own question, opening the meeting. */
export function ChatQuestion({ content }: { content: string }) {
  return (
    <div className="flex gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
        {t.transcript.you}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold">{t.transcript.you}</div>
        <div className="mt-1 whitespace-pre-wrap rounded-lg border bg-muted/40 px-3 py-2.5 text-sm">
          {content}
        </div>
      </div>
    </div>
  )
}
