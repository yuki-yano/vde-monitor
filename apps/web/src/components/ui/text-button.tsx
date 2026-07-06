import { cva } from "class-variance-authority";
import type { ButtonHTMLAttributes, Ref } from "react";

import { cn } from "@/lib/cn";

const textButtonVariants = cva(
  "inline-flex items-center gap-1 transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-latte-lavender disabled:pointer-events-none disabled:opacity-70",
  {
    variants: {
      variant: {
        title: "font-display text-latte-text text-left text-xl",
        subtle: "text-latte-subtext0 hover:text-latte-text",
      },
    },
    defaultVariants: {
      variant: "subtle",
    },
  },
);

type TextButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  ref?: Ref<HTMLButtonElement>;
  variant?: "title" | "subtle";
};

const TextButton = ({ className, variant, ref, ...props }: TextButtonProps) => (
  <button ref={ref} className={cn(textButtonVariants({ variant }), className)} {...props} />
);

export { TextButton };
