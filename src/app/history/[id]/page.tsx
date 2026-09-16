import { notFound } from "next/navigation"

import { getSessionDetail } from "@/server/sessions/detail"
import type { SessionDetailDto } from "@/types/api"
import { SessionDetail } from "./session-detail"

export const dynamic = "force-dynamic"

/**
 * Renders the conversation on the server.
 *
 * It used to be a client component that mounted, hydrated, and only then
 * asked for the session — so on a phone the reader waited for the HTML, then
 * ~200KB of JavaScript over their mobile link, then hydration, then a round
 * trip to the API, before the first word appeared. Four waits in a row, in
 * strict sequence, for data the server had in twenty milliseconds.
 *
 * Now the server does that read while it is rendering and the messages come
 * down inside the HTML. The client component takes over afterwards for the
 * things that genuinely need it — polling a live discussion, the composer,
 * the two modals — seeded with what is already on screen so nothing flashes
 * or re-fetches on arrival.
 */
export default async function SessionDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const detail = await getSessionDetail(params.id)
  if (!detail) notFound()

  return (
    <SessionDetail
      id={params.id}
      initial={detail as unknown as SessionDetailDto}
    />
  )
}
