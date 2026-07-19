import { cva } from "class-variance-authority";
import type { ButtonHTMLAttributes, Ref } from "react";

import { cn } from "@/lib/cn";

const buttonVariants = cva(
  "inline-flex select-none items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-[scale,translate,background-color,color,box-shadow,border-color,opacity] duration-200 ease-out active:scale-[0.96] active:duration-100 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-latte-blue focus-visible:ring-offset-2 focus-visible:ring-offset-latte-base disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary:
          "bg-latte-blue text-[var(--color-on-accent)] shadow-[0_1px_2px_rgb(var(--ctp-shadow)/0.18),0_5px_16px_-9px_rgb(var(--ctp-blue)/0.72)] hover:-translate-y-px hover:bg-latte-blue/90",
        ghost:
          "border border-latte-surface2/80 bg-latte-crust/32 text-latte-text shadow-[0_1px_2px_rgb(var(--ctp-shadow)/0.07)] hover:border-latte-overlay0/65 hover:bg-latte-base/82",
        danger:
          "bg-latte-red text-[var(--color-on-accent)] shadow-[0_1px_2px_rgb(var(--ctp-shadow)/0.18),0_5px_16px_-9px_rgb(var(--ctp-red)/0.7)] hover:-translate-y-px hover:bg-latte-red/90",
      },
      size: {
        sm: "px-3 py-1.5 text-xs",
        md: "px-4 py-2 text-sm",
        lg: "px-5 py-2.5 text-base",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  ref?: Ref<HTMLButtonElement>;
  variant?: "primary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
};

const Button = ({ className, variant, size, ref, ...props }: ButtonProps) => (
  <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
);

export { Button };
