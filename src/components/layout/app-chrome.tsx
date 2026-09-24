"use client"

import type { ReactNode } from "react"
import { usePathname } from "next/navigation"

import { ShellMain } from "@/components/layout/admin-shell"
import { Sidebar } from "@/components/layout/sidebar"

/**
 * The menu, the header band, and the content column — or, on the way in,
 * none of them.
 *
 * The unlock screen is the one page reachable without the secret, and it was
 * rendering inside the full shell: a menu of five destinations, every one of
 * which bounces straight back to the unlock screen, beside a breadcrumb for
 * an app the person cannot see yet. It offered nothing to do and implied
 * there was.
 *
 * Decided here rather than with a route group, which would mean moving every
 * other page into one to change the layout of a single screen.
 */
const BARE_PATHS = new Set(["/unlock"])

export function AppChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname()

  if (BARE_PATHS.has(pathname)) {
    return <main className="p-4 md:p-8">{children}</main>
  }

  return (
    <>
      <Sidebar />
      <ShellMain>{children}</ShellMain>
    </>
  )
}
