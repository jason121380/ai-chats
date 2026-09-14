import { NextResponse, type NextRequest } from "next/server"

import { prisma } from "@/server/db/prisma"
import { handleRouteError, parseDateRange } from "@/server/api-helpers"
import { getUsageByModel } from "@/server/usage/analytics"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  try {
    const range = parseDateRange(req.nextUrl.searchParams)
    const rows = await getUsageByModel(prisma, range)
    return NextResponse.json(rows)
  } catch (err) {
    return handleRouteError(err)
  }
}
