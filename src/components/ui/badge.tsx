import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * Status pill — 11px semi-bold on a tinted background, the LURE Meta
 * Platform `.badge` family. `white-space: nowrap` is load-bearing: in a
 * narrow cell a CJK label like「進行中」otherwise wraps into three
 * stacked characters and triples the row height.
 */
const badgeVariants = cva(
  "inline-flex items-center whitespace-nowrap rounded-pill px-2 py-[2px] text-[11px] font-semibold",
  {
    variants: {
      variant: {
        default: "bg-orange-bg text-orange",
        secondary: "bg-muted text-gray-500",
        destructive: "bg-red-bg text-red",
        outline: "border border-border-strong text-gray-500",
        success: "bg-green-bg text-green",
        warning: "bg-yellow-bg text-yellow",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
