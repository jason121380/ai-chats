import type { Metadata } from "next"

import { ShellMain } from "@/components/layout/admin-shell"
import { CurrencyProvider } from "@/components/layout/currency-context"
import { AdminShellProvider } from "@/components/layout/shell-context"
import { Sidebar } from "@/components/layout/sidebar"
import { prisma } from "@/server/db/prisma"
import { getCurrencySetting, NO_RATE } from "@/server/usage/currency"
import "./globals.css"

/**
 * Rendered per request, never prerendered.
 *
 * This layout reads the display currency from the database. Without this
 * line Next prerenders it at BUILD time — and the build has no database (the
 * Dockerfile passes a placeholder DATABASE_URL, because `next build` imports
 * route modules that validate the variable at import). So the read fails,
 * the "no rate configured" fallback gets baked into the static shell, and
 * every statically rendered page shows US$ forever no matter what rate is
 * set afterwards. /usage and /history did exactly that.
 *
 * Nothing is lost: every page here fetches its own data in the browser, so
 * the prerendered HTML was an empty skeleton either way.
 */
export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "AI 議會",
  description:
    "一個問題，多個 AI 模型獨立分析、匿名互評，最後由主席整合出決策。",
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  // Read here rather than in the browser so amounts are rendered in the right
  // currency the first time. A page that has no database (a broken
  // connection, a first boot) still renders — it just shows US$, which is
  // what the ledger holds anyway.
  const currency = await getCurrencySetting(prisma).catch(() => NO_RATE)

  return (
    <html lang="zh-Hant-TW">
      <head>
        {/*
          Noto Sans TC from the Google Fonts CDN — the same face designer_web
          loads through next/font. Deliberately NOT next/font here: that
          fetches at build time, which turns a network hiccup into a failed
          build.
        */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        {/* eslint-disable-next-line @next/next/no-page-custom-font --
            the rule targets the pages router, where a font link in one
            page leaks to that page only. This IS the root layout, so the
            stylesheet applies app-wide, which is exactly the intent. */}
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased">
        <CurrencyProvider value={currency}>
          <AdminShellProvider>
            <div className="min-h-screen bg-background">
              <Sidebar />
              <ShellMain>{children}</ShellMain>
            </div>
          </AdminShellProvider>
        </CurrencyProvider>
      </body>
    </html>
  )
}
