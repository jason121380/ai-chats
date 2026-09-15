import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"

import { prisma } from "@/server/db/prisma"
import {
  clearExchangeRate,
  getCurrencySetting,
  setExchangeRate,
} from "@/server/usage/currency"
import { handleRouteError } from "@/server/api-helpers"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    return NextResponse.json(await getCurrencySetting(prisma))
  } catch (err) {
    return handleRouteError(err)
  }
}

const rateSchema = z.object({
  // A decimal string, like every other money value here — a float would put
  // binary rounding into an amount somebody reconciles against an invoice.
  // Bounded well outside any plausible USD/TWD rate, only to catch a typo
  // like a stray zero, not to judge the market.
  usdToTwd: z
    .string()
    .regex(/^\d+(\.\d+)?$/)
    .refine((v) => Number(v) > 0 && Number(v) < 1000, {
      message: "匯率超出合理範圍",
    }),
})

/** Set the display rate. The stored ledger is untouched — see currency.ts. */
export async function POST(req: NextRequest) {
  try {
    const body = rateSchema.parse(await req.json())
    return NextResponse.json(await setExchangeRate(prisma, body.usdToTwd))
  } catch (err) {
    return handleRouteError(err)
  }
}

/** Go back to showing US$, which is what the amounts actually are. */
export async function DELETE() {
  try {
    await clearExchangeRate(prisma)
    return NextResponse.json({ usdToTwd: null, updatedAt: null })
  } catch (err) {
    return handleRouteError(err)
  }
}
