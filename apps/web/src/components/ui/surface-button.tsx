import { type ButtonHTMLAttributes, forwardRef } from "react";

import { cn } from "@/lib/cn";

type SurfaceButtonProps = ButtonHTMLAttributes<HTMLButtonElement>;

const SurfaceButton = forwardRef<HTMLButtonElement, SurfaceButtonProps>(
  ({ className, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "border-latte-surface2/50 bg-latte-crust/60 hover:border-latte-lavender/50 hover:bg-latte-crust/80 focus-visible:ring-latte-lavender hover:shadow-accent-sm w-full rounded-2xl border px-2.5 py-2 text-left transition-all duration-200 focus-visible:outline-hidden focus-visible:ring-2 sm:px-3 sm:py-3",
          className,
        )}
        {...props}
      />
    );
  },
);

SurfaceButton.displayName = "SurfaceButton";

export { SurfaceButton };
