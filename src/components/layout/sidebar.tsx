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
} from "lucide-react"

import { cn } from "@/lib/utils"

const NAV = [
  { href: "/", label: "New Chat", icon: MessageSquarePlus },
  { href: "/council", label: "Council", icon: Gavel },
  { href: "/history", label: "History", icon: History },
  { href: "/usage", label: "Usage", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r bg-background md:flex">
      <div className="flex items-center gap-2 px-5 py-5">
        <Users className="h-6 w-6" />
        <span className="text-lg font-semibold tracking-tight">
          AI Council
        </span>
      </div>
      <nav className="flex flex-1 flex-col gap-1 px-3">
        {NAV.map((item) => {
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
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          )
        })}
      </nav>
      <div className="px-5 py-4 text-xs text-muted-foreground">
        Round 1 → Critique → Chairman
      </div>
    </aside>
  )
}
