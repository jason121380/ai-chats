import { NextResponse } from "next/server"

import { prisma } from "@/server/db/prisma"

export const dynamic = "force-dynamic"

/**
 * Health check. Verifies app + database only — never calls paid AI APIs.
 */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`
    return NextResponse.json({ status: "ok", database: "ok" })
  } catch {
    return NextResponse.json(
      { status: "degraded", database: "error" },
      { status: 503 }
    )
  }
}
