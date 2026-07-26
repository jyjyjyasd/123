import { forwardRef, type InputHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = "text", ...rest }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        "w-full h-9 px-3 text-base bg-bg-primary text-text-primary",
        "border border-border-default rounded-md",
        "placeholder:text-text-tertiary",
        "transition-colors",
        "focus:outline-none focus:border-border-strong",
        "disabled:bg-bg-secondary disabled:text-text-disabled disabled:cursor-not-allowed",
        className,
      )}
      {...rest}
    />
  ),
);
Input.displayName = "Input";
