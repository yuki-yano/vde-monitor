import { type ButtonHTMLAttributes, forwardRef } from "react";

import { cn } from "@/lib/cn";

type ChipButtonProps = ButtonHTMLAttributes<HTMLButtonElement>;

const ChipButton = forwardRef<HTMLButtonElement, ChipButtonProps>(
  ({ className, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "border-latte-surface2/70 text-latte-subtext0 hover:text-latte-text focus-visible:ring-latte-lavender inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-60",
          className,
        )}
        {...props}
      />
    );
  },
);

ChipButton.displayName = "ChipButton";

export { ChipButton };
