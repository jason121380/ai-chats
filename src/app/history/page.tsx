"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Loader2 } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatTokens, formatUsd } from "@/lib/utils"
import { formatDateTime, modeLabel, t } from "@/lib/i18n"
import type { SessionDto } from "@/types/api"

export default function HistoryPage() {
  const [sessions, setSessions] = useState<SessionDto[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/sessions")
      .then(async (res) => {
        if (!res.ok) throw new Error(t.errors.loadSessions)
        setSessions((await res.json()) as SessionDto[])
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : String(err))
      )
  }, [])

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t.history.title}</h1>
        <p className="text-sm text-muted-foreground">
          {t.history.subtitle}
        </p>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {!sessions && !error && <Loader2 className="h-5 w-5 animate-spin" />}
      {sessions && sessions.length === 0 && (
        <p className="text-sm text-muted-foreground">{t.history.empty}</p>
      )}
      {sessions && sessions.length > 0 && (
        <div className="rounded-lg border bg-background">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t.history.colTitle}</TableHead>
                <TableHead>{t.history.colMode}</TableHead>
                <TableHead className="text-right">{t.history.colCalls}</TableHead>
                <TableHead className="text-right">{t.history.colTokens}</TableHead>
                <TableHead className="text-right">{t.history.colCost}</TableHead>
                <TableHead className="text-right">{t.history.colUpdated}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sessions.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="max-w-[280px]">
                    <Link
                      href={`/history/${s.id}`}
                      className="block truncate font-medium hover:underline"
                    >
                      {s.title}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{modeLabel(s.mode)}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {s.modelCalls ?? 0}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatTokens(s.totalTokens ?? 0)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatUsd(s.totalCostUsd)}
                  </TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">
                    {formatDateTime(s.updatedAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
