"use client"

import type { ReactNode } from "react"
import { Menu } from "lucide-react"

import { useMobileNav } from "@/components/layout/mobile-nav"
import { cn } from "@/lib/utils"

/**
 * Page header band — 60px on desktop, 52px on mobile, white on the
 * warm-white page, title left and controls right. Ported from the LURE
 * Meta Platform topbar so every page starts on the same line.
 *
 * The page subtitle rides next to the title behind a hairline divider
 * rather than under it: the band has a fixed height, and a second line
 * would either grow it or clip the description.
 */
export function Topbar({
  title,
  subtitle,
  actions,
  className,
}: {
  title: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  className?: string
}) {
  const { setOpen } = useMobileNav()
  return (
    <header
      className={cn(
        "sticky top-0 z-20 flex h-[52px] shrink-0 items-center gap-3 border-b border-border bg-white px-4 shadow-sm md:h-topbar md:px-6",
        className
      )}
    >
      {/* The sidebar is off-canvas below md, so this is the only way to
          navigate on a phone. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="開啟選單"
        className="-ml-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-orange-bg hover:text-orange active:scale-95 md:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>
      <h1 className="min-w-0 shrink-0 truncate text-[16px] font-bold tracking-tight text-ink">
        {title}
      </h1>
      {subtitle && (
        <>
          <span
            aria-hidden
            className="hidden h-4 w-px shrink-0 bg-border-strong lg:block"
          />
          <p className="hidden min-w-0 flex-1 truncate text-[12px] text-gray-500 lg:block">
            {subtitle}
          </p>
        </>
      )}
      {actions && (
        <div className="ml-auto flex shrink-0 items-center gap-2">{actions}</div>
      )}
    </header>
  )
}

/**
 * Standard body wrapper below a Topbar: 24px page padding, capped width,
 * 20px stack between sections.
 */
export function PageBody({
  children,
  className,
  width = "wide",
}: {
  children: ReactNode
  className?: string
  width?: "narrow" | "wide" | "full"
}) {
  return (
    <div
      className={cn(
        "mx-auto space-y-5 px-4 py-5 md:px-6 md:py-6",
        width === "narrow" && "max-w-3xl",
        width === "wide" && "max-w-6xl",
        className
      )}
    >
      {children}
    </div>
  )
}
