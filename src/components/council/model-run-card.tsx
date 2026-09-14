"use client"

import { useState } from "react"
import { ChevronDown, ChevronUp, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Markdown } from "@/components/ui/markdown"
import { StatusBadge } from "@/components/models/model-picker"
import { formatLatency, formatTokens, formatUsd } from "@/lib/utils"
import { PROVIDER_LABELS, ROLE_LABELS, type ModelRunDto } from "@/types/api"

export function ModelRunCard({
  run,
  pending,
  label,
}: {
  run?: ModelRunDto
  pending?: { provider: string; modelId: string }
  label?: string
}) {
  const [open, setOpen] = useState(false)

  const provider = run?.provider ?? pending?.provider ?? ""
  const modelId = run?.modelId ?? pending?.modelId ?? ""
  const running = !run || run.status === "RUNNING" || run.status === "PENDING"

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-semibold">
                {label ?? modelId}
              </span>
              {running ? (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" /> Running…
                </span>
              ) : (
                <StatusBadge status={run.status} />
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {PROVIDER_LABELS[provider] ?? provider}
              {run?.role ? ` · ${ROLE_LABELS[run.role] ?? run.role}` : ""}
            </p>
          </div>
          {run && !running && (
            <div className="flex items-center gap-4 text-right text-xs text-muted-foreground">
              <div>
                <div className="font-medium text-foreground">
                  {formatLatency(run.latencyMs)}
                </div>
                <div>latency</div>
              </div>
              <div>
                <div className="font-medium text-foreground">
                  {formatTokens(run.inputTokens)} /{" "}
                  {formatTokens(run.outputTokens)}
                </div>
                <div>in / out tokens</div>
              </div>
              <div>
                <div className="font-medium text-foreground">
                  {run.pricingStatus === "MISSING" && run.totalCostUsd === null
                    ? "no price"
                    : formatUsd(run.totalCostUsd)}
                </div>
                <div>cost</div>
              </div>
            </div>
          )}
        </div>

        {run?.status === "FAILED" || run?.status === "TIMEOUT" ? (
          <p className="mt-2 rounded bg-destructive/10 px-2 py-1 text-xs text-destructive">
            {run.errorCode ? `${run.errorCode}: ` : ""}
            {run.errorMessage ?? "Unknown error"}
          </p>
        ) : null}

        {run?.response ? (
          <div className="mt-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setOpen((o) => !o)}
            >
              {open ? (
                <ChevronUp className="mr-1 h-3 w-3" />
              ) : (
                <ChevronDown className="mr-1 h-3 w-3" />
              )}
              {open ? "Hide response" : "View response"}
            </Button>
            {open && (
              <div className="mt-2 max-h-96 overflow-y-auto rounded-md border bg-muted/40 p-3">
                <Markdown>{run.response}</Markdown>
              </div>
            )}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
