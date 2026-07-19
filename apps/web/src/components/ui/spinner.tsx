import type { HTMLAttributes } from "react";

import { cn } from "@/lib/cn";

const sizeClass = {
  sm: "h-8 w-8",
  md: "h-10 w-10",
};

type SpinnerProps = HTMLAttributes<HTMLDivElement> & {
  size?: keyof typeof sizeClass;
};

const Spinner = ({ className, size = "md", ...props }: SpinnerProps) => {
  const sizing = sizeClass[size];
  return (
    <div className={cn("relative", className)} {...props}>
      <div className={cn("border-latte-blue/20 rounded-full border-2", sizing)} />
      <div
        className={cn(
          "border-latte-blue absolute inset-0 animate-spin rounded-full border-2 border-t-transparent",
          sizing,
        )}
      />
    </div>
  );
};

export { Spinner };
