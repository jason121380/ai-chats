import { NextResponse } from "next/server"

import { getSessionDetail } from "@/server/sessions/detail"
import { handleRouteError, jsonError } from "@/server/api-helpers"

export const dynamic = "force-dynamic"

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const detail = await getSessionDetail(params.id)
    if (!detail) return jsonError(404, "Session not found")
    return NextResponse.json(detail)
  } catch (err) {
    return handleRouteError(err)
  }
}
