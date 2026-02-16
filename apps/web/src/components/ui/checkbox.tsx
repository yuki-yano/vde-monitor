import { forwardRef, type InputHTMLAttributes } from "react";

import { cn } from "@/lib/cn";

type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(({ className, ...props }, ref) => {
  return (
    <input
      ref={ref}
      type="checkbox"
      className={cn(
        "accent-latte-lavender border-latte-surface2 bg-latte-base focus:ring-latte-lavender/40 h-4 w-4 rounded border outline-none transition focus:ring-2 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
});

Checkbox.displayName = "Checkbox";

export { Checkbox };
