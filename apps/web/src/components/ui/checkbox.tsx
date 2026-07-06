import type { InputHTMLAttributes, Ref } from "react";

import { cn } from "@/lib/cn";

type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  ref?: Ref<HTMLInputElement>;
};

const Checkbox = ({ className, ref, ...props }: CheckboxProps) => {
  return (
    <input
      ref={ref}
      type="checkbox"
      className={cn(
        "accent-latte-lavender border-latte-surface2 bg-latte-base focus:ring-latte-lavender/40 h-4 w-4 rounded-sm border outline-hidden transition focus:ring-2 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
};

export { Checkbox };
