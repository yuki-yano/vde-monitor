import { AlertTriangle, CheckCircle, Circle, Clock, Loader2, Sparkles, Zap } from "lucide-react";
import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/cn";

type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?:
    | "running"
    | "waiting"
    | "permission"
    | "shell"
    | "editor"
    | "done"
    | "unknown"
    | "codex"
    | "claude";
  size?: "sm" | "md";
  animateIcon?: boolean;
};

const toneClass: Record<NonNullable<BadgeProps["tone"]>, string> = {
  running: "bg-latte-green/14 text-latte-green-text border-latte-green/32",
  waiting: "bg-latte-peach/14 text-latte-peach-text border-latte-peach/32",
  permission: "bg-latte-red/16 text-latte-red-text border-latte-red/42",
  shell: "bg-latte-blue/15 text-latte-blue-text border-latte-blue/40",
  editor: "bg-latte-maroon/14 text-latte-maroon-text border-latte-maroon/36",
  done: "bg-latte-blue/15 text-latte-blue-text border-latte-blue/40",
  unknown: "bg-latte-surface1 text-latte-text border-latte-overlay0/60",
  codex: "bg-latte-mauve/15 text-latte-mauve-text border-latte-mauve/40",
  claude: "bg-latte-lavender/15 text-latte-lavender-text border-latte-lavender/40",
};

const toneIcon: Record<
  NonNullable<BadgeProps["tone"]>,
  (className: string, animate: boolean) => ReactNode
> = {
  running: (className, animate) => (
    <Loader2 className={cn(animate ? "animate-spin" : null, className)} />
  ),
  waiting: (className) => <Clock className={className} />,
  permission: (className, animate) => (
    <AlertTriangle
      className={cn(animate ? "animate-pulse motion-reduce:animate-none" : null, className)}
    />
  ),
  shell: (className) => <Circle className={className} />,
  editor: (className) => <Circle className={className} />,
  done: (className) => <CheckCircle className={className} />,
  unknown: (className) => <Circle className={className} />,
  codex: (className) => <Sparkles className={className} />,
  claude: (className) => <Zap className={className} />,
};

const sizeClass = {
  md: "px-3 py-1 text-xs tracking-[0.08em]",
  sm: "px-2.5 py-0.5 text-[11px] tracking-[0.07em]",
};

const iconSizeClass = {
  md: "h-3 w-3",
  sm: "h-2.5 w-2.5",
};

const Badge = ({
  className,
  tone = "unknown",
  size = "md",
  children,
  animateIcon = true,
  ...props
}: BadgeProps) => {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border font-semibold uppercase",
        sizeClass[size],
        toneClass[tone],
        className,
      )}
      {...props}
    >
      {toneIcon[tone](iconSizeClass[size], animateIcon)}
      {children}
    </span>
  );
};

export { Badge };
