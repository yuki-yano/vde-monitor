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
      "border-latte-surface2 bg-latte-surface0/60 inline-flex items-center gap-1 rounded-full border p-1",
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
      "text-latte-subtext0 inline-flex items-center justify-center rounded-full px-3 py-1 text-xs font-semibold transition",
      "hover:bg-latte-surface1/70 hover:text-latte-text",
      "data-[state=active]:text-latte-text data-[state=active]:bg-latte-base/90 data-[state=active]:shadow-elev-1",
      className,
    )}
    {...props}
  />
);

export { Tabs, TabsList, TabsTrigger };
