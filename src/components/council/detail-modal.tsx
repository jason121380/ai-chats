"use client"

import { useEffect, type ReactNode } from "react"
import { X } from "lucide-react"

/**
 * A panel that belongs to a meeting but not inside it.
 *
 * The closing summary and the cost breakdown are both long, both structured,
 * and both about the meeting rather than part of it. Rendered in the scroll
 * they bury the last thing anyone said, and on a phone they push the composer
 * off the screen entirely — so each one lives behind an icon in the corner
 * and opens over the chat.
 */
export function DetailModal({
  open,
  onClose,
  title,
  icon,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  icon: ReactNode
  children: ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKey)
    document.body.style.overflow = "hidden"
    return () => {
      document.removeEventListener("keydown", onKey)
      document.body.style.overflow = ""
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 py-10"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-2xl rounded-lg border border-gray-200 bg-white"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-gray-100 px-5 py-3">
          {icon}
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="關閉"
            className="ml-auto text-gray-400 transition-colors hover:text-gray-700"
          >
            <X size={18} />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  )
}
