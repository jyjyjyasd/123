import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

// Notion-style buttons (PRD §5.5 hard rules)
//   primary  → bg-[#37352F] text-white
//   secondary → bg-bg-tertiary text-text-primary
//   ghost     → transparent, hover bg-bg-hover
//   danger    → text-error, hover bg-error-bg
const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-1.5 whitespace-nowrap",
    "font-medium select-none transition-colors",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-primary/20",
    "disabled:pointer-events-none disabled:opacity-50",
  ].join(" "),
  {
    variants: {
      variant: {
        primary: "bg-[#37352F] text-white hover:bg-[#2f2d28]",
        secondary:
          "bg-bg-tertiary text-text-primary hover:bg-[rgba(55,53,47,0.12)]",
        ghost: "bg-transparent text-text-primary hover:bg-bg-hover",
        danger: "bg-transparent text-error hover:bg-error-bg",
      },
      size: {
        sm: "h-7 px-2.5 text-sm rounded-md",
        md: "h-8 px-3 text-sm rounded-md",
        lg: "h-10 px-4 text-base rounded-md",
        icon: "h-8 w-8 rounded-md",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, type = "button", ...rest }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(buttonVariants({ variant, size }), className)}
      {...rest}
    />
  ),
);
Button.displayName = "Button";
