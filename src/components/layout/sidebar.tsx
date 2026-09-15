"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  BarChart3,
  Gavel,
  History,
  MessageSquarePlus,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react"

import { useMobileNav } from "@/components/layout/mobile-nav"
import { cn } from "@/lib/utils"
import { t } from "@/lib/i18n"

/**
 * Left sidebar — 224px fixed column, ported from the LURE Meta Platform
 * layout: 60px logo header, nav items grouped under 10px uppercase
 * section labels, orange-tinted active state, hints pinned to the
 * bottom above the safe area.
 */

interface NavItem {
  href: string
  label: string
  icon: LucideIcon
}

interface NavGroup {
  label: string
  items: NavItem[]
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: "一般",
    items: [
      { href: "/", label: t.nav.newChat, icon: MessageSquarePlus },
      { href: "/council", label: t.nav.council, icon: Gavel },
    ],
  },
  {
    label: "紀錄",
    items: [
      { href: "/history", label: t.nav.history, icon: History },
      { href: "/usage", label: t.nav.usage, icon: BarChart3 },
    ],
  },
  {
    label: "設定",
    items: [{ href: "/settings", label: t.nav.settings, icon: Settings }],
  },
]

export function Sidebar() {
  const pathname = usePathname()
  const { open, setOpen } = useMobileNav()

  return (
    <>
      {/* Backdrop — mobile only; the desktop sidebar is part of the layout,
          not an overlay. */}
      {open && (
        <button
          type="button"
          aria-label="關閉選單"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-40 bg-black/20 md:hidden"
        />
      )}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[280px] shrink-0 flex-col border-r border-border bg-white transition-transform duration-200",
          "md:sticky md:top-0 md:h-screen md:w-sidebar md:translate-x-0 md:shadow-none",
          open ? "translate-x-0 shadow-md" : "-translate-x-full"
        )}
      >
      {/* Logo header — same 60px band as the topbar next to it, so the
          two align across the divider. */}
      <div className="flex h-topbar shrink-0 items-center gap-2 border-b border-border px-4">
        <Users className="h-[18px] w-[18px] shrink-0 text-orange" />
        <span className="text-[15px] font-bold tracking-tight text-ink">
          {t.app.name}
        </span>
        {/* Muted on purpose — it labels what this is, it must not
            compete with the product name next to it. */}
        <span className="shrink-0 rounded border border-orange-border bg-orange-bg px-1.5 py-px text-xxs font-medium text-orange-muted">
          {t.app.tagline}
        </span>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-2 py-1.5">
        {NAV_GROUPS.map((group, idx) => (
          <div key={group.label}>
            <div
              className={cn(
                "px-2.5 pb-0.5 pt-1.5 text-xxs font-semibold uppercase tracking-[0.8px] text-gray-300",
                idx > 0 && "mt-1"
              )}
            >
              {group.label}
            </div>
            {group.items.map((item) => {
              const active =
                item.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(item.href)
              const Icon = item.icon
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "mb-0.5 flex min-h-[32px] select-none items-center gap-2.5 rounded-lg px-2.5 py-1.5",
                    "text-[13px] font-medium transition-colors duration-150 active:scale-[0.98]",
                    active
                      ? "bg-orange-bg font-semibold text-orange"
                      : "text-gray-500 hover:bg-orange-bg hover:text-orange"
                  )}
                >
                  <span className="flex w-[18px] shrink-0 items-center justify-center">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                </Link>
              )
            })}
          </div>
        ))}
      </nav>

      <div
        className="shrink-0 space-y-1 border-t border-border px-4 pt-3 text-[11px] leading-relaxed text-gray-300"
        style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}
      >
        <div>{t.nav.councilHint}</div>
        <div>{t.nav.discussionHint}</div>
        </div>
      </aside>
    </>
  )
}
