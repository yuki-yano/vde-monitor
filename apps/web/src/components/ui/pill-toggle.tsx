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
        "focus-visible:ring-latte-lavender inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] transition focus-visible:outline-hidden focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-60",
        active
          ? "border-latte-lavender/60 bg-latte-lavender/10 text-latte-lavender-text shadow-accent-inset"
          : "border-latte-surface2/70 text-latte-subtext0 hover:border-latte-overlay1 hover:text-latte-text",
        className,
      )}
      {...props}
    />
  );
};

export { PillToggle };
