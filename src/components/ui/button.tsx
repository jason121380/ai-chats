import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * Pill button, ported from the LURE Meta Platform `.btn` family:
 * 36px tall (30px `sm`), full-round radius, orange CTA, ghost secondary,
 * soft-red danger. Variant NAMES stay shadcn's so existing call sites
 * don't move; only the looks changed.
 */
const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-1.5 whitespace-nowrap font-semibold leading-none",
    "rounded-pill border-[1.5px] transition-colors duration-150",
    "cursor-pointer disabled:pointer-events-none disabled:opacity-50",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange/40",
    "[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  ],
  {
    variants: {
      variant: {
        default:
          "border-orange bg-orange text-white hover:border-orange-dark hover:bg-orange-dark",
        destructive:
          "border-transparent bg-red-bg text-red hover:bg-[#FFCDD2]",
        outline:
          "border-border bg-transparent text-ink hover:border-orange-border hover:bg-orange-bg hover:text-orange",
        secondary:
          "border-orange-border bg-orange-bg text-orange hover:bg-orange hover:text-white",
        ghost:
          "border-transparent bg-transparent text-gray-500 hover:bg-orange-bg hover:text-orange",
        link: "border-transparent text-orange underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-[18px] text-[13px]",
        sm: "h-[30px] px-3.5 text-xs",
        lg: "h-10 px-6 text-sm",
        icon: "h-9 w-9 px-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
