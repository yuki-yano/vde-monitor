import type { ButtonHTMLAttributes, Ref } from "react";

import { cn } from "@/lib/cn";

type PillToggleProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  ref?: Ref<HTMLButtonElement>;
  active?: boolean;
};

const PillToggle = ({ className, active = false, ref, ...props }: PillToggleProps) => {
  const ariaPressed = props["aria-pressed"] ?? active;
  return (
    <button
      ref={ref}
      aria-pressed={ariaPressed}
      className={cn(
        "focus-visible:ring-latte-blue inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] transition-[scale,background-color,color,border-color,box-shadow] duration-200 ease-out active:scale-[0.96] active:duration-100 focus-visible:outline-hidden focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-60",
        active
          ? "border-latte-blue/65 bg-latte-blue/18 text-latte-blue-text shadow-[inset_0_0_0_1px_rgb(var(--ctp-blue)/0.14),0_1px_3px_rgb(var(--ctp-shadow)/0.1)]"
          : "border-latte-surface2/80 bg-latte-crust/24 text-latte-subtext0 hover:border-latte-overlay1 hover:bg-latte-base/58 hover:text-latte-text",
        className,
      )}
      {...props}
    />
  );
};

export { PillToggle };
