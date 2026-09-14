import * as React from "react"

import { cn } from "@/lib/utils"

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>

/** Text field — 12px radius, hairline border, orange on focus. */
const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-[38px] w-full rounded-lg border border-border bg-white px-3 text-[13px] text-ink outline-none transition-colors",
          "file:border-0 file:bg-transparent file:text-[13px] file:font-medium",
          "placeholder:text-gray-300 focus:border-orange disabled:cursor-not-allowed disabled:opacity-60",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
