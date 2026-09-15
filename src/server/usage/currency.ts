import type { PrismaClient } from "@prisma/client"

/**
 * Showing costs in New Taiwan dollars.
 *
 * The ledger is and stays US dollars: that is what the providers bill, what
 * ModelPricing records, and what every *CostUsd column holds. This is a
 * display layer over it and nothing more — no stored amount is ever
 * converted, so changing the rate changes what is shown and never what was
 * recorded.
 *
 * There is deliberately NO default rate. A number that looks like a rate but
 * was never checked against anything is the worst possible artefact here: it
 * reads as fact, it decays every single day, and nothing about the figures it
 * produces would look wrong. Until someone sets one, amounts stay in US$ —
 * which is the currency the ledger is actually in, so that fallback is
 * correct rather than merely safe.
 */
export const RATE_KEY = "usd_to_twd"

export interface CurrencySetting {
  /** NT dollars per 1 US dollar, as a decimal string. Null = not set. */
  usdToTwd: string | null
  /** When someone last set it — the age is part of the reading. */
  updatedAt: string | null
}

export const NO_RATE: CurrencySetting = { usdToTwd: null, updatedAt: null }

/** A rate this old is shown with a warning rather than silently. */
export const RATE_STALE_DAYS = 30

export async function getCurrencySetting(
  db: PrismaClient
): Promise<CurrencySetting> {
  const row = await db.appSetting.findUnique({ where: { key: RATE_KEY } })
  if (!row) return NO_RATE
  return { usdToTwd: row.value, updatedAt: row.updatedAt.toISOString() }
}

export async function setExchangeRate(
  db: PrismaClient,
  rate: string
): Promise<CurrencySetting> {
  const row = await db.appSetting.upsert({
    where: { key: RATE_KEY },
    create: { key: RATE_KEY, value: rate },
    update: { value: rate },
  })
  return { usdToTwd: row.value, updatedAt: row.updatedAt.toISOString() }
}

export async function clearExchangeRate(db: PrismaClient): Promise<void> {
  await db.appSetting.deleteMany({ where: { key: RATE_KEY } })
}
