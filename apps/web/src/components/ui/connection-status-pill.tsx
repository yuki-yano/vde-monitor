import type { HTMLAttributes } from "react";

import { cn } from "@/lib/cn";

type ConnectionStatusPillProps = HTMLAttributes<HTMLDivElement> & {
  status: "healthy" | "degraded" | "disconnected";
  healthyLabel?: string;
  degradedLabel?: string;
  disconnectedLabel?: string;
};

const connectionStatusClasses: Record<
  ConnectionStatusPillProps["status"],
  { wrapper: string; dot: string }
> = {
  healthy: {
    wrapper: "border-latte-green/40 bg-latte-green/10 text-latte-green",
    dot: "bg-latte-green shadow-[0_0_8px_rgb(var(--ctp-green)/0.6)]",
  },
  degraded: {
    wrapper: "border-latte-yellow/40 bg-latte-yellow/10 text-latte-yellow",
    dot: "bg-latte-yellow shadow-[0_0_8px_rgb(var(--ctp-yellow)/0.6)]",
  },
  disconnected: {
    wrapper: "border-latte-red/40 bg-latte-red/10 text-latte-red animate-pulse",
    dot: "bg-latte-red shadow-[0_0_8px_rgb(var(--ctp-red)/0.6)]",
  },
};

const ConnectionStatusPill = ({
  className,
  status,
  healthyLabel = "Connected",
  degradedLabel = "Degraded",
  disconnectedLabel = "Disconnected",
  ...props
}: ConnectionStatusPillProps) => {
  const labelByStatus: Record<ConnectionStatusPillProps["status"], string> = {
    healthy: healthyLabel,
    degraded: degradedLabel,
    disconnected: disconnectedLabel,
  };
  const styles = connectionStatusClasses[status];
  const label = labelByStatus[status];

  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-all",
        styles.wrapper,
        className,
      )}
      {...props}
    >
      <span className={cn("h-2 w-2 rounded-full", styles.dot)} />
      <span>{label}</span>
    </div>
  );
};

export { ConnectionStatusPill };
