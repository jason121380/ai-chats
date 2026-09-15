import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * Buttons per designer_web's STYLE.md:
 *
 *   主按鈕  bg-rose-brand text-white px-5 py-2.5 text-sm font-semibold
 *   次按鈕  border-gray-200 bg-white text-gray-600
 *   刪除    text-red-500
 *
 * rounded-lg like everything else, and no shadow — that repo removed them
 * site-wide. Variant NAMES stay shadcn's so existing call sites don't move.
 */
const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg",
    "text-sm transition-colors disabled:pointer-events-none disabled:opacity-50",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-light",
    "[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  ],
  {
    variants: {
      variant: {
        default: "bg-rose-brand font-semibold text-white hover:bg-rose-dark",
        secondary:
          "border border-gray-200 bg-white font-medium text-gray-600 hover:border-rose-brand hover:text-rose-brand",
        outline:
          "border border-gray-200 bg-white font-medium text-gray-600 hover:border-rose-brand hover:text-rose-brand",
        destructive:
          "border border-gray-200 bg-white font-medium text-red-500 hover:border-red-300 hover:bg-red-50",
        ghost: "font-medium text-gray-500 hover:bg-gray-50 hover:text-gray-900",
        link: "font-medium text-rose-brand underline-offset-4 hover:underline",
      },
      size: {
        default: "px-5 py-2.5",
        sm: "px-3 py-2 text-xs font-medium",
        lg: "px-6 py-3",
        icon: "h-10 w-10 p-0",
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
