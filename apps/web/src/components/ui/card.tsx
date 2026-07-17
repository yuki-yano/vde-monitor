import type { HTMLAttributes } from "react";

import { cn } from "@/lib/cn";

type CardProps = HTMLAttributes<HTMLDivElement> & {
  interactive?: boolean;
};

const Card = ({ className, interactive = false, ...props }: CardProps) => {
  return (
    <div
      className={cn(
        "shadow-glass border-latte-surface1/60 bg-latte-base/80 rounded-3xl border p-3 backdrop-blur-sm sm:p-4",
        interactive &&
          "hover:border-latte-lavender/40 hover:shadow-elev-5 cursor-pointer transition duration-300 ease-out hover:-translate-y-1 hover:scale-[1.01] active:translate-y-0 active:scale-[0.99]",
        className,
      )}
      {...props}
    />
  );
};

export { Card };
