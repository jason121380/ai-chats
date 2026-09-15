"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { ChevronRight, Menu } from "lucide-react"

import { useAdminShell } from "@/components/layout/shell-context"
import { t } from "@/lib/i18n"

/**
 * The h-14 header band from designer_web's admin: white, hairline bottom
 * border, sticky. It carries navigation controls and a breadcrumb — NOT the
 * page title, which lives in the body as an h1 (see PageShell).
 */

const CRUMB_LABELS: Record<string, string> = {
  council: t.nav.council,
  history: t.nav.history,
  usage: t.nav.usage,
  settings: t.nav.settings,
}

/** A session id makes a useless crumb; the page's own h1 names the row. */
function crumbLabel(segment: string): string {
  return CRUMB_LABELS[segment] ?? (segment.length > 12 ? "詳細" : segment)
}

export function AdminHeader() {
  const pathname = usePathname()
  const { setOpen, collapsed, toggleCollapsed } = useAdminShell()

  const segments = pathname.split("/").filter(Boolean)
  const crumbs = segments.map((seg, i) => ({
    label: crumbLabel(seg),
    href: "/" + segments.slice(0, i + 1).join("/"),
  }))

  return (
    <header className="sticky top-0 z-20 flex h-14 flex-shrink-0 items-center justify-between border-b border-gray-100 bg-white px-4 md:px-8">
      <nav className="flex min-w-0 items-center gap-1.5 overflow-x-auto text-sm">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="開啟選單"
          className="mr-1 flex-shrink-0 text-gray-600 transition-colors hover:text-gray-900 md:hidden"
        >
          <Menu size={20} />
        </button>
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label={collapsed ? "展開選單" : "收合選單"}
          title={collapsed ? "展開選單" : "收合選單"}
          className="mr-2 hidden flex-shrink-0 text-gray-600 transition-colors hover:text-gray-900 md:inline-flex"
        >
          <Menu size={20} />
        </button>
        <Link
          href="/"
          className="flex-shrink-0 text-gray-400 transition-colors hover:text-gray-700"
        >
          {t.app.name}
        </Link>
        {crumbs.map((crumb, i) => (
          <span key={crumb.href} className="flex items-center gap-1.5">
            <ChevronRight size={12} className="flex-shrink-0 text-gray-300" />
            {i === crumbs.length - 1 ? (
              <span className="whitespace-nowrap font-medium text-gray-900">
                {crumb.label}
              </span>
            ) : (
              <Link
                href={crumb.href}
                className="whitespace-nowrap text-gray-400 transition-colors hover:text-gray-700"
              >
                {crumb.label}
              </Link>
            )}
          </span>
        ))}
      </nav>
    </header>
  )
}
