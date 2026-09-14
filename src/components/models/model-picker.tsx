"use client"

import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { statusLabel, t } from "@/lib/i18n"
import { PROVIDER_LABELS, ROLE_LABELS, type ModelConfigDto } from "@/types/api"

export function modelKey(m: { provider: string; modelId: string }): string {
  return `${m.provider}/${m.modelId}`
}

export function MultiModelPicker({
  models,
  selected,
  onToggle,
}: {
  models: ModelConfigDto[]
  selected: Set<string>
  onToggle: (key: string) => void
}) {
  const usable = models.filter((m) => m.enabled)
  if (usable.length === 0) {
    return (
      <p className="text-[13px] text-gray-500">{t.errors.noEnabledModels}</p>
    )
  }
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {usable.map((m) => {
        const key = modelKey(m)
        const isSelected = selected.has(key)
        return (
          <button
            key={key}
            type="button"
            onClick={() => onToggle(key)}
            className={cn(
              "flex items-center justify-between rounded-lg border px-3 py-2 text-left text-[13px] transition-colors",
              isSelected
                ? "border-orange bg-orange-bg"
                : "border-border bg-white hover:border-orange-border hover:bg-orange-bg",
              !m.providerConfigured && "opacity-60"
            )}
          >
            <span className="flex min-w-0 flex-col">
              <span
                className={cn(
                  "truncate font-semibold",
                  isSelected ? "text-orange" : "text-ink"
                )}
              >
                {m.displayName}
              </span>
              <span className="truncate text-[11px] text-gray-500">
                {PROVIDER_LABELS[m.provider] ?? m.provider} ·{" "}
                {ROLE_LABELS[m.defaultRole] ?? m.defaultRole}
                {!m.providerConfigured && ` · ${t.errors.noApiKey}`}
              </span>
            </span>
            <span
              className={cn(
                "ml-2 flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border-2 text-[10px] leading-none",
                isSelected
                  ? "border-orange bg-orange text-white"
                  : "border-border bg-white"
              )}
            >
              {isSelected ? "✓" : ""}
            </span>
          </button>
        )
      })}
    </div>
  )
}

export function ChairmanPicker({
  models,
  value,
  onChange,
}: {
  models: ModelConfigDto[]
  value: string | null
  onChange: (key: string) => void
}) {
  const usable = models.filter((m) => m.enabled)
  return (
    <Select value={value ?? undefined} onValueChange={onChange}>
      <SelectTrigger className="w-full sm:w-72">
        <SelectValue placeholder={t.council.selectChairmanPlaceholder} />
      </SelectTrigger>
      <SelectContent>
        {usable.map((m) => (
          <SelectItem key={modelKey(m)} value={modelKey(m)}>
            {m.displayName} ({PROVIDER_LABELS[m.provider] ?? m.provider})
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function StatusBadge({ status }: { status: string }) {
  const variant =
    status === "COMPLETED"
      ? "success"
      : status === "PARTIAL"
        ? "warning"
        : status === "FAILED" || status === "TIMEOUT"
          ? "destructive"
          : "secondary"
  return <Badge variant={variant}>{statusLabel(status)}</Badge>
}
