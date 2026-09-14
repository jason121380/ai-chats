import { NextResponse, type NextRequest } from "next/server"

import { prisma } from "@/server/db/prisma"
import { handleRouteError, parseDateRange } from "@/server/api-helpers"
import { getModelRuns } from "@/server/usage/analytics"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  try {
    const p = req.nextUrl.searchParams
    const range = parseDateRange(p)
    const result = await getModelRuns(prisma, {
      ...range,
      provider: p.get("provider") ?? undefined,
      modelId: p.get("model") ?? undefined,
      stage: p.get("stage") ?? undefined,
      status: p.get("status") ?? undefined,
      sessionId: p.get("sessionId") ?? undefined,
      councilRunId: p.get("councilRunId") ?? undefined,
      page: p.get("page") ? Number(p.get("page")) : undefined,
      pageSize: p.get("pageSize") ? Number(p.get("pageSize")) : undefined,
    })
    return NextResponse.json(result)
  } catch (err) {
    return handleRouteError(err)
  }
}
