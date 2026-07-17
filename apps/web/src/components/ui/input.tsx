import type { InputHTMLAttributes, Ref } from "react";

import { cn } from "@/lib/cn";

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  ref?: Ref<HTMLInputElement>;
};

const Input = ({ className, ref, ...props }: InputProps) => {
  return (
    <input
      ref={ref}
      className={cn(
        "border-latte-surface2 text-latte-text focus:border-latte-lavender focus:ring-latte-lavender/30 bg-latte-base/70 shadow-elev-1 w-full rounded-xl border px-3 py-1.5 text-base outline-hidden transition focus:ring-2 sm:px-4 sm:py-2",
        className,
      )}
      {...props}
    />
  );
};

export { Input };
