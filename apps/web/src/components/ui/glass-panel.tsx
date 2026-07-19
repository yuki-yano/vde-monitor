import type { HTMLAttributes } from "react";

import { cn } from "@/lib/cn";

type GlassPanelProps = HTMLAttributes<HTMLDivElement> & {
  contentClassName?: string;
};

const GlassPanel = ({ className, contentClassName, children, ...props }: GlassPanelProps) => {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-[var(--material-stroke)] bg-[var(--material-raised)] px-2.5 py-2 shadow-[inset_0_1px_0_var(--material-highlight),0_1px_2px_rgb(var(--ctp-shadow)/0.04)] backdrop-blur-xl sm:px-5 sm:py-4",
        className,
      )}
      {...props}
    >
      <div className={cn("relative", contentClassName)}>{children}</div>
    </div>
  );
};

export { GlassPanel };
