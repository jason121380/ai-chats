import { NextResponse } from "next/server"

import { prisma } from "@/server/db/prisma"
import { backfillMissingCosts } from "@/server/usage/backfill"
import { handleRouteError } from "@/server/api-helpers"

export const dynamic = "force-dynamic"

/**
 * Price the calls that were made before their model had a price.
 *
 * Only ever fills rows whose cost is MISSING, and marks what it writes
 * ESTIMATED — see backfillMissingCosts. A row that already has a cost is not
 * a candidate, so running this twice is a no-op the second time.
 */
export async function POST() {
  try {
    const result = await backfillMissingCosts(prisma)
    return NextResponse.json(result)
  } catch (err) {
    return handleRouteError(err)
  }
}
