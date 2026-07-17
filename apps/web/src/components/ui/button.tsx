import { cva } from "class-variance-authority";
import type { ButtonHTMLAttributes, Ref } from "react";

import { cn } from "@/lib/cn";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition active:scale-[0.96] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-latte-lavender disabled:opacity-50 disabled:pointer-events-none",
  {
    variants: {
      variant: {
        primary: "bg-latte-lavender text-latte-base shadow-glow hover:-translate-y-px",
        ghost: "bg-transparent text-latte-text border border-latte-surface2 hover:bg-latte-crust",
        danger: "bg-latte-red text-latte-base shadow-glow hover:-translate-y-px",
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
