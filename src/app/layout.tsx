import type { Metadata } from "next"

import { Sidebar } from "@/components/layout/sidebar"
import "./globals.css"

export const metadata: Metadata = {
  title: "AI Council",
  description:
    "Ask one question, get independent analysis, anonymous cross-critique and a chairman decision from multiple AI models.",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">
        <div className="flex min-h-screen">
          <Sidebar />
          <main className="flex-1 overflow-x-hidden bg-muted/20">
            {children}
          </main>
        </div>
      </body>
    </html>
  )
}
