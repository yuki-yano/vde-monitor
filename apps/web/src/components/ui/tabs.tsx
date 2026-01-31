import * as TabsPrimitive from "@radix-ui/react-tabs";
import { type ComponentPropsWithoutRef, type ElementRef, forwardRef } from "react";

import { cn } from "@/lib/cn";

const Tabs = TabsPrimitive.Root;

const TabsList = forwardRef<
  ElementRef<typeof TabsPrimitive.List>,
  ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      "border-latte-surface2 bg-latte-surface0/60 inline-flex items-center gap-1 rounded-full border p-1",
      className,
    )}
    {...props}
  />
));

TabsList.displayName = "TabsList";

const TabsTrigger = forwardRef<
  ElementRef<typeof TabsPrimitive.Trigger>,
  ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "text-latte-subtext0 rounded-full px-3 py-1 text-xs font-semibold transition",
      "hover:bg-latte-surface1/70 hover:text-latte-text",
      "data-[state=active]:text-latte-text data-[state=active]:bg-latte-base/90 data-[state=active]:shadow-sm",
      className,
    )}
    {...props}
  />
));

TabsTrigger.displayName = "TabsTrigger";

export { Tabs, TabsList, TabsTrigger };
