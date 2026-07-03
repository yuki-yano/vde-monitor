import { cva } from "class-variance-authority";
import { type ButtonHTMLAttributes, forwardRef } from "react";

import { cn } from "@/lib/cn";

const iconButtonVariants = cva(
  "inline-flex items-center justify-center rounded-full border transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-latte-lavender disabled:pointer-events-none disabled:opacity-60 disabled:cursor-not-allowed",
  {
    variants: {
      variant: {
        base: "border-latte-surface2 bg-latte-base/80 text-latte-text hover:border-latte-lavender/60 hover:text-latte-lavender shadow-elev-3 backdrop-blur-sm",
        lavender:
          "border-latte-lavender/40 bg-latte-lavender/10 text-latte-lavender hover:border-latte-lavender/60 hover:bg-latte-lavender/20 backdrop-blur-sm",
        lavenderStrong:
          "border-latte-lavender/50 bg-latte-lavender/15 text-latte-lavender hover:border-latte-lavender/70 hover:bg-latte-lavender/25 border-2 shadow-accent-outline backdrop-blur-xl transition-all duration-200 hover:shadow-accent-lg",
        dangerOutline:
          "border-latte-surface2 text-latte-subtext0 hover:text-latte-red hover:border-latte-red/60",
      },
      size: {
        xs: "h-6 w-6",
        sm: "h-8 w-8",
        md: "h-10 w-10",
        lg: "h-12 w-12",
      },
    },
    defaultVariants: {
      variant: "base",
      size: "sm",
    },
  },
);

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "base" | "lavender" | "lavenderStrong" | "dangerOutline";
  size?: "xs" | "sm" | "md" | "lg";
};

const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(iconButtonVariants({ variant, size }), className)}
        {...props}
      />
    );
  },
);

IconButton.displayName = "IconButton";

export { IconButton };
