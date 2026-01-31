import type { HTMLAttributes } from "react";

import { cn } from "@/lib/cn";

type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: "running" | "waiting" | "permission" | "done" | "unknown" | "codex" | "claude";
};

const toneClass: Record<NonNullable<BadgeProps["tone"]>, string> = {
  running: "bg-latte-green/20 text-latte-green border-latte-green/40 animate-pulse-soft",
  waiting: "bg-latte-peach/20 text-latte-peach border-latte-peach/40",
  permission:
    "bg-latte-red/20 text-latte-red border-latte-red/40 shadow-[0_0_12px_rgb(var(--ctp-red)/0.4)]",
  done: "bg-latte-blue/15 text-latte-blue border-latte-blue/40",
  unknown: "bg-latte-surface1 text-latte-overlay1 border-latte-overlay0/60",
  codex: "bg-latte-mauve/15 text-latte-mauve border-latte-mauve/40",
  claude: "bg-latte-lavender/15 text-latte-lavender border-latte-lavender/40",
};

const Badge = ({ className, tone = "unknown", ...props }: BadgeProps) => {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em]",
        toneClass[tone],
        className,
      )}
      {...props}
    />
  );
};

export { Badge };
