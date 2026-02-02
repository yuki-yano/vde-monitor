import { AlertTriangle, CheckCircle, Circle, Clock, Loader2, Sparkles, Zap } from "lucide-react";
import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/cn";

type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: "running" | "waiting" | "permission" | "done" | "unknown" | "codex" | "claude";
};

const toneClass: Record<NonNullable<BadgeProps["tone"]>, string> = {
  running:
    "bg-latte-green/20 text-latte-green border-latte-green/40 shadow-[0_0_12px_rgb(var(--ctp-green)/0.3)]",
  waiting:
    "bg-latte-peach/20 text-latte-peach border-latte-peach/40 shadow-[0_0_8px_rgb(var(--ctp-peach)/0.25)]",
  permission:
    "bg-latte-red/25 text-latte-red border-latte-red/60 shadow-[0_0_20px_rgb(var(--ctp-red)/0.5)] animate-pulse-attention",
  done: "bg-latte-blue/15 text-latte-blue border-latte-blue/40",
  unknown: "bg-latte-surface1 text-latte-overlay1 border-latte-overlay0/60",
  codex: "bg-latte-mauve/15 text-latte-mauve border-latte-mauve/40",
  claude: "bg-latte-lavender/15 text-latte-lavender border-latte-lavender/40",
};

const toneIcon: Record<NonNullable<BadgeProps["tone"]>, ReactNode> = {
  running: <Loader2 className="h-3 w-3 animate-spin" />,
  waiting: <Clock className="h-3 w-3" />,
  permission: <AlertTriangle className="animate-bounce-subtle h-3 w-3" />,
  done: <CheckCircle className="h-3 w-3" />,
  unknown: <Circle className="h-3 w-3" />,
  codex: <Sparkles className="h-3 w-3" />,
  claude: <Zap className="h-3 w-3" />,
};

const Badge = ({ className, tone = "unknown", children, ...props }: BadgeProps) => {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]",
        toneClass[tone],
        className,
      )}
      {...props}
    >
      {toneIcon[tone]}
      {children}
    </span>
  );
};

export { Badge };
