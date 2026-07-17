import { cva } from "class-variance-authority";
import type { HTMLAttributes } from "react";

import { cn } from "@/lib/cn";

const calloutVariants = cva("rounded-2xl border px-3 py-1.5 sm:px-4 sm:py-2", {
  variants: {
    tone: {
      warning: "border-latte-peach/40 bg-latte-peach/10 text-latte-peach-text",
      error: "border-latte-red/40 bg-latte-red/10 text-latte-red-text",
    },
    size: {
      sm: "text-sm",
      xs: "text-xs",
    },
  },
  compoundVariants: [
    {
      tone: "warning",
      size: "sm",
      className: "border-latte-peach/50",
    },
  ],
  defaultVariants: {
    tone: "warning",
    size: "sm",
  },
});

type CalloutProps = HTMLAttributes<HTMLDivElement> & {
  tone?: "warning" | "error";
  size?: "sm" | "xs";
};

const Callout = ({ className, tone, size, ...props }: CalloutProps) => {
  return <div className={cn(calloutVariants({ tone, size }), className)} {...props} />;
};

export { Callout };
