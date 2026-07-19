import { cva } from "class-variance-authority";
import type { ButtonHTMLAttributes, Ref } from "react";

import { cn } from "@/lib/cn";

const iconButtonVariants = cva(
  "relative inline-flex select-none items-center justify-center rounded-full border transition-[scale,background-color,color,box-shadow,border-color] duration-200 ease-out active:scale-[0.96] active:duration-100 after:absolute after:content-[''] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-latte-blue focus-visible:ring-offset-2 focus-visible:ring-offset-latte-base disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-60",
  {
    variants: {
      variant: {
        base: "border-latte-surface2/80 bg-latte-crust/32 text-latte-text shadow-[0_1px_3px_rgb(var(--ctp-shadow)/0.12)] backdrop-blur-xl hover:border-latte-blue/45 hover:bg-latte-base/90 hover:text-latte-blue-text",
        lavender:
          "border-latte-lavender/40 bg-latte-lavender/10 text-latte-lavender-text hover:border-latte-lavender/60 hover:bg-latte-lavender/20 backdrop-blur-sm",
        lavenderStrong:
          "border-latte-lavender/50 bg-latte-lavender/15 text-latte-lavender-text hover:border-latte-lavender/70 hover:bg-latte-lavender/25 border-2 shadow-accent-outline backdrop-blur-xl duration-200 hover:shadow-accent-lg",
        dangerOutline:
          "border-latte-surface2 text-latte-subtext0 hover:text-latte-red-text hover:border-latte-red/60",
      },
      size: {
        xs: "h-7 w-7 after:-inset-1.5",
        sm: "h-8 w-8 after:-inset-0.5",
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
  ref?: Ref<HTMLButtonElement>;
  variant?: "base" | "lavender" | "lavenderStrong" | "dangerOutline";
  size?: "xs" | "sm" | "md" | "lg";
};

const IconButton = ({ className, variant, size, ref, ...props }: IconButtonProps) => (
  <button ref={ref} className={cn(iconButtonVariants({ variant, size }), className)} {...props} />
);

export { IconButton };
