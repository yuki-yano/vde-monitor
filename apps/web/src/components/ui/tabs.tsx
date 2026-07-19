import * as TabsPrimitive from "@radix-ui/react-tabs";
import type { ComponentPropsWithRef } from "react";

import { cn } from "@/lib/cn";

const Tabs = TabsPrimitive.Root;

const TabsList = ({
  className,
  ref,
  ...props
}: ComponentPropsWithRef<typeof TabsPrimitive.List>) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      "inline-flex items-center gap-1 rounded-full border border-[var(--control-stroke)] bg-[var(--control-track)] p-1 shadow-[inset_0_1px_2px_rgb(var(--ctp-shadow)/0.12)]",
      className,
    )}
    {...props}
  />
);

const TabsTrigger = ({
  className,
  ref,
  ...props
}: ComponentPropsWithRef<typeof TabsPrimitive.Trigger>) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "text-latte-subtext0 relative inline-flex items-center justify-center rounded-full px-3 py-1 text-xs font-semibold transition-[background-color,color,box-shadow,scale] duration-200 ease-out after:absolute after:inset-x-0 after:-inset-y-1 after:content-[''] active:scale-[0.96] active:duration-100 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-latte-blue",
      "hover:bg-latte-surface1/65 hover:text-latte-text",
      "data-[state=active]:bg-[var(--control-selected)] data-[state=active]:text-latte-text data-[state=active]:shadow-[0_0_0_1px_var(--control-selected-stroke),0_1px_4px_rgb(var(--ctp-shadow)/0.2),inset_0_1px_0_var(--material-highlight)]",
      className,
    )}
    {...props}
  />
);

export { Tabs, TabsList, TabsTrigger };
