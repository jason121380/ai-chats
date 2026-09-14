"use client"

import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import remarkCjkFriendly from "remark-cjk-friendly"

import { cn } from "@/lib/utils"

/**
 * Renders model output as Markdown. Chairman answers use headings, tables
 * and lists, so raw text would be unreadable.
 *
 * remark-cjk-friendly is required, not optional: CommonMark's flanking rules
 * mean `而是**「為什麼」**` renders as literal asterisks, because the delimiter
 * sits between a CJK character and CJK punctuation. Models write like that
 * constantly in Chinese.
 */
export function Markdown({
  children,
  className,
}: {
  children: string
  className?: string
}) {
  return (
    <div className={cn("space-y-3 text-sm leading-relaxed", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkCjkFriendly]}
        components={{
          h1: ({ children }) => (
            <h1 className="mt-5 text-lg font-bold tracking-tight first:mt-0">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="mt-5 border-b pb-1 text-base font-bold tracking-tight first:mt-0">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="mt-4 text-sm font-semibold first:mt-0">
              {children}
            </h3>
          ),
          p: ({ children }) => <p className="leading-relaxed">{children}</p>,
          ul: ({ children }) => (
            <ul className="list-disc space-y-1 pl-5">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal space-y-1 pl-5">{children}</ol>
          ),
          strong: ({ children }) => (
            <strong className="font-semibold">{children}</strong>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 pl-3 italic text-muted-foreground">
              {children}
            </blockquote>
          ),
          code: ({ children, className: cls }) =>
            cls?.includes("language-") ? (
              <code className="block overflow-x-auto rounded bg-muted p-3 text-xs">
                {children}
              </code>
            ) : (
              <code className="rounded bg-muted px-1 py-0.5 text-xs">
                {children}
              </code>
            ),
          table: ({ children }) => (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs">
                {children}
              </table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border-b bg-muted/50 px-2 py-1.5 text-left font-medium">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border-b px-2 py-1.5 align-top">{children}</td>
          ),
          hr: () => <hr className="my-4" />,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}
