import type { HTMLAttributes } from "react";

import { cn } from "@/lib/cn";

type InsetPanelProps = HTMLAttributes<HTMLDivElement>;

const InsetPanel = ({ className, ...props }: InsetPanelProps) => {
  return (
    <div
      className={cn(
        "rounded-2xl border border-[var(--material-stroke)] bg-[var(--material-inset)] shadow-[inset_0_1px_3px_rgb(var(--ctp-shadow)/0.07)]",
        className,
      )}
      {...props}
    />
  );
};

export { InsetPanel };
