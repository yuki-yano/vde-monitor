import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/cn";
import type { LastInputTone } from "@/lib/session-format";

const sizeClass = {
  md: "px-3 py-1 text-xs",
  sm: "px-3 py-1 text-[11px]",
  xs: "px-2 py-0.5 text-[10px]",
};

type LastInputPillProps = HTMLAttributes<HTMLSpanElement> & {
  tone: LastInputTone;
  label: ReactNode;
  srLabel?: string;
  value: string;
  size?: keyof typeof sizeClass;
  showDot?: boolean;
};

const LastInputPill = ({
  className,
  tone,
  label,
  srLabel,
  value,
  size = "sm",
  showDot = true,
  ...props
}: LastInputPillProps) => {
  const labelClass =
    typeof label === "string"
      ? "text-[9px] uppercase tracking-[0.2em]"
      : "text-[10px] leading-none";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border font-semibold",
        tone.pill,
        sizeClass[size],
        className,
      )}
      {...props}
    >
      {showDot && <span className={cn("h-1.5 w-1.5 rounded-full", tone.dot)} />}
      <span className={labelClass} aria-hidden={srLabel ? true : undefined}>
        {label}
      </span>
      {srLabel && <span className="sr-only">{srLabel}</span>}
      <span className="tabular-nums">{value}</span>
    </span>
  );
};

export { LastInputPill };
