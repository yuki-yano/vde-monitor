import type { ButtonHTMLAttributes, Ref } from "react";

import { cn } from "@/lib/cn";

type SurfaceButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  ref?: Ref<HTMLButtonElement>;
};

const SurfaceButton = ({ className, ref, ...props }: SurfaceButtonProps) => (
  <button
    ref={ref}
    className={cn(
      "border-latte-surface2/60 bg-latte-crust/52 hover:border-latte-blue/42 hover:bg-latte-crust/72 focus-visible:ring-latte-blue w-full rounded-2xl border px-2.5 py-2 text-left transition-[scale,background-color,border-color,box-shadow] duration-200 ease-out active:scale-[0.985] active:duration-100 focus-visible:outline-hidden focus-visible:ring-2 sm:px-3 sm:py-3",
      className,
    )}
    {...props}
  />
);

export { SurfaceButton };
