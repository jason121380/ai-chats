"use client"

import { createContext, useCallback, useContext, type ReactNode } from "react"

import { formatTwd } from "@/lib/utils"
import type { CurrencySetting } from "@/server/usage/currency"

const CurrencyContext = createContext<CurrencySetting>({
  usdToTwd: null,
  updatedAt: null,
})

/**
 * Carries the exchange rate to every amount on the page.
 *
 * The value is read on the server in the root layout and handed down as a
 * prop, NOT fetched from the browser. A fetch would paint every amount in
 * US$ and then swap it to NT$ a moment later — and a number that changes by
 * a factor of thirty while you are reading it is worse than either currency
 * on its own.
 */
export function CurrencyProvider({
  value,
  children,
}: {
  value: CurrencySetting
  children: ReactNode
}) {
  return (
    <CurrencyContext.Provider value={value}>
      {children}
    </CurrencyContext.Provider>
  )
}

export interface Money {
  /** Format a stored US dollar amount in whatever currency is configured. */
  format: (usd: string | number | null | undefined) => string
  /** NT dollars per US dollar, or null when nobody has set one. */
  rate: string | null
  /** When the rate was set, so its age can be shown next to it. */
  updatedAt: string | null
  /** True once a rate exists and amounts are therefore converted. */
  converted: boolean
}

export function useMoney(): Money {
  const setting = useContext(CurrencyContext)
  const format = useCallback(
    (usd: string | number | null | undefined) =>
      formatTwd(usd, setting.usdToTwd),
    [setting.usdToTwd]
  )
  return {
    format,
    rate: setting.usdToTwd,
    updatedAt: setting.updatedAt,
    converted: setting.usdToTwd !== null,
  }
}
