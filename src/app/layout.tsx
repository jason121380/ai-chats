import type { Metadata } from "next"

import { Sidebar } from "@/components/layout/sidebar"
import "./globals.css"

export const metadata: Metadata = {
  title: "AI 議會",
  description:
    "一個問題，多個 AI 模型獨立分析、匿名互評，最後由主席整合出決策。",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="zh-Hant-TW">
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
