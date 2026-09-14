import { NextResponse, type NextRequest } from "next/server"

import { prisma } from "@/server/db/prisma"
import { handleRouteError, parseDateRange } from "@/server/api-helpers"
import { getUsageSummary } from "@/server/usage/analytics"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  try {
    const range = parseDateRange(req.nextUrl.searchParams)
    const summary = await getUsageSummary(prisma, range)
    return NextResponse.json(summary)
  } catch (err) {
    return handleRouteError(err)
  }
}
