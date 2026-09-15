"use client"

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react"
import { usePathname } from "next/navigation"

/**
 * Shell state for the admin layout: the mobile drawer and the desktop
 * collapse, both from designer_web's AdminShell.
 *
 * It lives in a context because the pieces sit in different subtrees — the
 * toggles are in each page's header, the drawer is the Sidebar in the root
 * layout — and threading props through every page would be worse.
 */
const ShellContext = createContext<{
  open: boolean
  setOpen: (v: boolean) => void
  collapsed: boolean
  toggleCollapsed: () => void
}>({
  open: false,
  setOpen: () => {},
  collapsed: false,
  toggleCollapsed: () => {},
})

export function useAdminShell() {
  return useContext(ShellContext)
}

export function AdminShellProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  // Desktop collapse is session-only, not persisted — designer_web learned
  // that remembering it means one stray click hides the sidebar on every
  // future visit, with nothing on screen explaining why.
  const [collapsed, setCollapsed] = useState(false)
  const pathname = usePathname()

  // Close the drawer on navigation, or it covers the page it just opened.
  useEffect(() => {
    setOpen(false)
  }, [pathname])

  return (
    <ShellContext.Provider
      value={{
        open,
        setOpen,
        collapsed,
        toggleCollapsed: () => setCollapsed((c) => !c),
      }}
    >
      {children}
    </ShellContext.Provider>
  )
}
