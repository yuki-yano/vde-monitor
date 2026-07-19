import type { HTMLAttributes } from "react";

import { cn } from "@/lib/cn";

type CardProps = HTMLAttributes<HTMLDivElement> & {
  interactive?: boolean;
};

const Card = ({ className, interactive = false, ...props }: CardProps) => {
  return (
    <div
      className={cn(
        "rounded-3xl border border-[var(--material-stroke)] bg-[var(--material-canvas)] p-3 shadow-[var(--material-shadow)] backdrop-blur-2xl sm:p-4",
        interactive &&
          "cursor-pointer transition-[translate,scale,box-shadow,background-color,border-color] duration-300 ease-out hover:-translate-y-px hover:bg-[var(--material-raised)] hover:shadow-[var(--material-shadow-hover)] active:translate-y-0 active:scale-[0.985] active:duration-100",
        className,
      )}
      {...props}
    />
  );
};

export { Card };
