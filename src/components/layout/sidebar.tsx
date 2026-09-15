"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  BarChart3,
  ChevronRight,
  Gavel,
  History,
  MessageSquarePlus,
  Settings,
  X,
  type LucideIcon,
} from "lucide-react"

import { useAdminShell } from "@/components/layout/shell-context"
import { cn } from "@/lib/utils"
import { t } from "@/lib/i18n"

/**
 * Fixed 16rem sidebar, ported from designer_web's admin shell: white on the
 * gray-50 surface, a 主選單 label above the items, rose-brand fill on the
 * active row, off-canvas on mobile and collapsible on desktop.
 */

const NAV: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/", label: t.nav.newChat, icon: MessageSquarePlus },
  { href: "/council", label: t.nav.council, icon: Gavel },
  { href: "/history", label: t.nav.history, icon: History },
  { href: "/usage", label: t.nav.usage, icon: BarChart3 },
  { href: "/settings", label: t.nav.settings, icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()
  const { open, setOpen, collapsed } = useAdminShell()

  return (
    <>
      {open && (
        <div
          aria-hidden
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
        />
      )}

      <aside
        className={cn(
          "fixed left-0 top-0 z-40 flex h-dvh w-sidebar flex-col border-r border-gray-100 bg-white",
          "transform transition-transform duration-200 ease-out",
          open ? "translate-x-0" : "-translate-x-full",
          collapsed ? "md:-translate-x-full" : "md:translate-x-0"
        )}
      >
        <div className="flex h-14 flex-shrink-0 items-center border-b border-gray-100 px-5">
          <div className="flex w-full items-center justify-between gap-2">
            <span className="text-sm font-semibold text-gray-900">
              {t.app.name}
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="關閉選單"
              className="shrink-0 text-gray-400 transition-colors hover:text-gray-700 md:hidden"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-widest text-gray-400">
            主選單
          </p>
          <div className="space-y-0.5">
            {NAV.map((item) => {
              const isActive =
                item.href === "/"
                  ? pathname === "/"
                  : pathname === item.href ||
                    pathname.startsWith(item.href + "/")
              const Icon = item.icon
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
                    isActive
                      ? "bg-rose-brand text-white"
                      : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                  )}
                >
                  <Icon
                    size={16}
                    className={cn(
                      "flex-shrink-0 transition-colors",
                      isActive
                        ? "text-white"
                        : "text-gray-400 group-hover:text-gray-600"
                    )}
                  />
                  <span className="flex-1">{item.label}</span>
                  {isActive && (
                    <ChevronRight size={12} className="text-white/70" />
                  )}
                </Link>
              )
            })}
          </div>
        </nav>

        <div className="flex-shrink-0 border-t border-gray-100 px-3 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <div className="space-y-1 px-3 text-xs leading-relaxed text-gray-400">
            <p>{t.nav.councilHint}</p>
            <p>{t.nav.discussionHint}</p>
          </div>
        </div>
      </aside>
    </>
  )
}
