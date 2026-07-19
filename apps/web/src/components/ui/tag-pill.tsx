import { cva } from "class-variance-authority";
import type { HTMLAttributes } from "react";

import { cn } from "@/lib/cn";

const tagPillVariants = cva("rounded-full px-3 py-1 font-medium tabular-nums", {
  variants: {
    tone: {
      danger: "bg-latte-red/15 text-latte-red-text text-[11px] uppercase tracking-[0.12em]",
      neutral: "border border-latte-surface2/55 bg-latte-crust/42 text-latte-subtext0 text-xs",
      meta: "border border-latte-surface2/50 bg-latte-crust/30 text-latte-subtext0 text-[11px]",
      status: "px-0 py-0 rounded-none text-[11px] uppercase tracking-[0.12em]",
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
