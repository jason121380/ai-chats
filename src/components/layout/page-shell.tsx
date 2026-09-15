import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

/**
 * Page heading + content container, matching designer_web's admin pages:
 * an h1 with a gray-400 description line, the primary command top-right,
 * and a max-w-5xl work surface with room to scroll past the last row.
 *
 * The title is NOT in the header band — that band carries the breadcrumb
 * and the nav toggles (see AdminHeader).
 */
export function PageShell({
  title,
  description,
  actions,
  children,
  width = "wide",
  className,
}: {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  children: ReactNode
  width?: "narrow" | "wide"
  className?: string
}) {
  return (
    <div
      className={cn(
        "mx-auto pb-20",
        width === "narrow" ? "max-w-3xl" : "max-w-5xl",
        className
      )}
    >
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
          {description && (
            <p className="mt-1 text-sm text-gray-400">{description}</p>
          )}
        </div>
        {actions && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {actions}
          </div>
        )}
      </div>
      <div className="space-y-6">{children}</div>
    </div>
  )
}
