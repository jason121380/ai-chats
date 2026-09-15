import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * designer_web states statuses as small tinted labels rather than pills —
 * `rounded-lg` like every other surface, 12px, medium weight. `nowrap` is
 * load-bearing: in a narrow cell a CJK label otherwise wraps one character
 * per line and triples the row height.
 */
const badgeVariants = cva(
  "inline-flex items-center whitespace-nowrap rounded-lg px-2 py-0.5 text-xs font-medium",
  {
    variants: {
      variant: {
        default: "bg-rose-light text-rose-dark",
        secondary: "bg-gray-100 text-gray-500",
        destructive: "bg-red-50 text-red-500",
        outline: "border border-gray-200 text-gray-500",
        success: "bg-emerald-50 text-emerald-700",
        warning: "bg-amber-50 text-amber-700",
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
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
