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
 * Open/closed state for the mobile nav drawer.
 *
 * It lives in a context because the two halves sit in different subtrees:
 * the hamburger is in each page's Topbar, the drawer is the Sidebar in the
 * root layout. Passing props between them would mean threading state
 * through every page.
 */
const MobileNavContext = createContext<{
  open: boolean
  setOpen: (v: boolean) => void
}>({ open: false, setOpen: () => {} })

export function useMobileNav() {
  return useContext(MobileNavContext)
}

export function MobileNavProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  // Close on navigation. Without this, tapping a link leaves the drawer
  // covering the page it just opened.
  useEffect(() => {
    setOpen(false)
  }, [pathname])

  return (
    <MobileNavContext.Provider value={{ open, setOpen }}>
      {children}
    </MobileNavContext.Provider>
  )
}
