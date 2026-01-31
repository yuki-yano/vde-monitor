import type { HTMLAttributes } from "react";

import { cn } from "@/lib/cn";

type CardProps = HTMLAttributes<HTMLDivElement>;

const Card = ({ className, ...props }: CardProps) => {
  return (
    <div
      className={cn(
        "shadow-glass border-latte-surface1/60 bg-latte-base/80 rounded-3xl border p-4 backdrop-blur",
        className,
      )}
      {...props}
    />
  );
};

export { Card };
