import { Command as CommandPrimitive } from "cmdk";
import type { ComponentPropsWithRef } from "react";

import { cn } from "@/lib/cn";

const Command = ({ className, ref, ...props }: ComponentPropsWithRef<typeof CommandPrimitive>) => (
  <CommandPrimitive
    ref={ref}
    className={cn(
      "bg-latte-base text-latte-text flex h-full w-full flex-col overflow-hidden",
      className,
    )}
    {...props}
  />
);

const CommandInput = ({
  className,
  ref,
  ...props
}: ComponentPropsWithRef<typeof CommandPrimitive.Input>) => (
  <div className="border-latte-surface2/70 border-b px-1.5 py-1.5 sm:px-2 sm:py-2">
    <CommandPrimitive.Input
      ref={ref}
      className={cn(
        "placeholder:text-latte-subtext0 text-latte-text w-full bg-transparent px-1.5 py-1 text-sm outline-hidden sm:px-2 sm:py-1.5",
        className,
      )}
      {...props}
    />
  </div>
);

const CommandList = ({
  className,
  ref,
  ...props
}: ComponentPropsWithRef<typeof CommandPrimitive.List>) => (
  <CommandPrimitive.List
    ref={ref}
    className={cn(
      "custom-scrollbar max-h-[min(48dvh,360px)] overflow-y-auto overflow-x-hidden",
      className,
    )}
    {...props}
  />
);

const CommandEmpty = ({
  className,
  ref,
  ...props
}: ComponentPropsWithRef<typeof CommandPrimitive.Empty>) => (
  <CommandPrimitive.Empty
    ref={ref}
    className={cn("text-latte-subtext0 px-2.5 py-4 text-center text-sm sm:px-3 sm:py-6", className)}
    {...props}
  />
);

const CommandGroup = ({
  className,
  ref,
  ...props
}: ComponentPropsWithRef<typeof CommandPrimitive.Group>) => (
  <CommandPrimitive.Group ref={ref} className={cn("p-0.5 sm:p-1", className)} {...props} />
);

const CommandItem = ({
  className,
  ref,
  ...props
}: ComponentPropsWithRef<typeof CommandPrimitive.Item>) => (
  <CommandPrimitive.Item
    ref={ref}
    className={cn(
      "aria-selected:bg-latte-blue/16 aria-selected:text-latte-text relative flex cursor-default select-none items-center rounded-xl px-2.5 py-1.5 text-sm outline-hidden sm:px-3 sm:py-2",
      className,
    )}
    {...props}
  />
);

export { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList };
