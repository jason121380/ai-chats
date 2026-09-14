"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Loader2 } from "lucide-react"

import { PageBody, Topbar } from "@/components/layout/topbar"
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
    <>
      <Topbar title={t.history.title} subtitle={t.history.subtitle} />
      <PageBody>
        {error && <p className="text-[13px] text-red">{error}</p>}
        {!sessions && !error && (
          <Loader2 className="h-5 w-5 animate-spin text-orange" />
        )}
        {sessions && sessions.length === 0 && (
          <p className="text-[13px] text-gray-500">{t.history.empty}</p>
        )}
        {sessions && sessions.length > 0 && (
        <div className="overflow-hidden rounded-[16px] border border-border bg-white">
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
      </PageBody>
    </>
  )
}
