import type { HTMLAttributes } from "react";

import { cn } from "@/lib/cn";

type ConnectionStatusPillProps = HTMLAttributes<HTMLDivElement> & {
  status: "healthy" | "degraded" | "disconnected";
  transport?: "sse" | "polling";
  healthyLabel?: string;
  degradedLabel?: string;
  disconnectedLabel?: string;
};

const connectionStatusClasses: Record<
  ConnectionStatusPillProps["status"],
  { wrapper: string; dot: string }
> = {
  healthy: {
    wrapper: "border-latte-green/30 bg-latte-green/10 text-latte-green-text",
    dot: "bg-latte-green shadow-[0_0_0_3px_rgb(var(--ctp-green)/0.12)]",
  },
  degraded: {
    wrapper: "border-latte-yellow/30 bg-latte-yellow/10 text-latte-yellow-text",
    dot: "bg-latte-yellow shadow-[0_0_0_3px_rgb(var(--ctp-yellow)/0.12)]",
  },
  disconnected: {
    wrapper: "border-latte-red/30 bg-latte-red/10 text-latte-red-text",
    dot: "bg-latte-red shadow-[0_0_0_3px_rgb(var(--ctp-red)/0.12)] animate-pulse motion-reduce:animate-none",
  },
};

const ConnectionStatusPill = ({
  className,
  status,
  transport,
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
  const showSseBadge = status === "healthy" && transport === "sse";

  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium",
        styles.wrapper,
        className,
      )}
      {...props}
    >
      <span className={cn("h-2 w-2 rounded-full", styles.dot)} />
      <span>{label}</span>
      {showSseBadge && (
        <span className="rounded-sm bg-current/15 px-1 py-0.5 text-[10px] font-semibold leading-none tracking-wide opacity-80">
          SSE
        </span>
      )}
    </div>
  );
};

export { ConnectionStatusPill };
