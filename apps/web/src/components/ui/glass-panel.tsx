import type { HTMLAttributes } from "react";

import { cn } from "@/lib/cn";

type GlassPanelProps = HTMLAttributes<HTMLDivElement> & {
  contentClassName?: string;
};

const GlassPanel = ({ className, contentClassName, children, ...props }: GlassPanelProps) => {
  return (
    <div
      className={cn(
        "border-latte-surface2/70 bg-latte-mantle/90 relative overflow-hidden rounded-2xl border px-2.5 py-2 backdrop-blur-sm sm:px-5 sm:py-4",
        className,
      )}
      {...props}
    >
      <div className="from-latte-crust/30 to-latte-crust/10 pointer-events-none absolute inset-0 bg-linear-to-r via-transparent" />
      <div className={cn("relative", contentClassName)}>{children}</div>
    </div>
  );
};

export { GlassPanel };
