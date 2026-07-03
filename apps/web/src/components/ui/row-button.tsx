import { type ButtonHTMLAttributes, forwardRef } from "react";

import { cn } from "@/lib/cn";

type RowButtonProps = ButtonHTMLAttributes<HTMLButtonElement>;

const RowButton = forwardRef<HTMLButtonElement, RowButtonProps>(({ className, ...props }, ref) => {
  return (
    <button
      ref={ref}
      className={cn(
        "focus-visible:ring-latte-lavender flex w-full items-center justify-between gap-3 px-2.5 py-1.5 text-left focus-visible:outline-hidden focus-visible:ring-2 sm:px-3 sm:py-2",
        className,
      )}
      {...props}
    />
  );
});

RowButton.displayName = "RowButton";

export { RowButton };
