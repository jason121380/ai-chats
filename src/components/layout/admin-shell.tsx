"use client"

import type { ReactNode } from "react"

import { AdminHeader } from "@/components/layout/admin-header"
import { useAdminShell } from "@/components/layout/shell-context"
import { cn } from "@/lib/utils"

/**
 * The content column beside the sidebar, ported from designer_web's
 * AdminShell: the sidebar is `fixed`, so this reserves its width with a
 * margin that animates away when the sidebar is collapsed.
 */
export function ShellMain({ children }: { children: ReactNode }) {
  const { collapsed } = useAdminShell()
  return (
    <div
      className={cn(
        "flex min-h-screen min-w-0 flex-col transition-[margin] duration-200 ease-out",
        collapsed ? "md:ml-0" : "md:ml-sidebar"
      )}
    >
      <AdminHeader />
      <main className="flex-1 overflow-x-clip p-4 md:p-8">{children}</main>
    </div>
  )
}
