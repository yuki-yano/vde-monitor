import { cva } from "class-variance-authority";
import type { HTMLAttributes } from "react";

import { cn } from "@/lib/cn";

const tagPillVariants = cva("rounded-full px-3 py-1 font-semibold", {
  variants: {
    tone: {
      danger: "bg-latte-red/15 text-latte-red text-[10px] uppercase tracking-[0.3em]",
      neutral: "border border-latte-surface2/70 bg-latte-crust/60 text-latte-subtext0 text-xs",
      meta: "border border-latte-surface2/60 bg-latte-crust/40 text-latte-subtext0 text-[10px]",
      status: "px-0 py-0 rounded-none text-[10px] uppercase tracking-[0.25em]",
    },
  },
  defaultVariants: {
    tone: "neutral",
  },
});

type TagPillProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: "danger" | "neutral" | "meta" | "status";
};

const TagPill = ({ className, tone, ...props }: TagPillProps) => {
  return <span className={cn(tagPillVariants({ tone }), className)} {...props} />;
};

export { TagPill };
