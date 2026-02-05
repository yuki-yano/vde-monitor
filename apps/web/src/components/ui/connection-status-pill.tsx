import type { HTMLAttributes } from "react";

import { cn } from "@/lib/cn";

type ConnectionStatusPillProps = HTMLAttributes<HTMLDivElement> & {
  status: "healthy" | "degraded" | "disconnected";
  healthyLabel?: string;
  degradedLabel?: string;
  disconnectedLabel?: string;
};

const ConnectionStatusPill = ({
  className,
  status,
  healthyLabel = "Connected",
  degradedLabel = "Degraded",
  disconnectedLabel = "Disconnected",
  ...props
}: ConnectionStatusPillProps) => {
  const label =
    status === "healthy" ? healthyLabel : status === "degraded" ? degradedLabel : disconnectedLabel;
  const wrapperClass =
    status === "healthy"
      ? "border-latte-green/40 bg-latte-green/10 text-latte-green"
      : status === "degraded"
        ? "border-latte-yellow/40 bg-latte-yellow/10 text-latte-yellow"
        : "border-latte-red/40 bg-latte-red/10 text-latte-red animate-pulse";
  const dotClass =
    status === "healthy"
      ? "bg-latte-green shadow-[0_0_8px_rgb(var(--ctp-green)/0.6)]"
      : status === "degraded"
        ? "bg-latte-yellow shadow-[0_0_8px_rgb(var(--ctp-yellow)/0.6)]"
        : "bg-latte-red shadow-[0_0_8px_rgb(var(--ctp-red)/0.6)]";

  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-all",
        wrapperClass,
        className,
      )}
      {...props}
    >
      <span className={cn("h-2 w-2 rounded-full", dotClass)} />
      <span>{label}</span>
    </div>
  );
};

export { ConnectionStatusPill };
