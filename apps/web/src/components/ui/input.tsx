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
        "border-latte-surface2/80 text-latte-text focus:border-latte-blue focus:ring-latte-blue/25 bg-latte-crust/32 w-full rounded-xl border px-3 py-1.5 text-base shadow-[0_1px_3px_rgb(var(--ctp-shadow)/0.08)] outline-hidden transition-[border-color,box-shadow,background-color] duration-200 focus:bg-latte-base/82 focus:ring-2 sm:px-4 sm:py-2",
        className,
      )}
      {...props}
    />
  );
};

export { Input };
