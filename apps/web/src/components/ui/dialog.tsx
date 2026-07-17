import * as DialogPrimitive from "@radix-ui/react-dialog";
import type { ComponentPropsWithRef, ComponentPropsWithoutRef, HTMLAttributes } from "react";

import { cn } from "@/lib/cn";

const Dialog = DialogPrimitive.Root;
const DialogPortal = DialogPrimitive.Portal;

const DialogOverlay = ({
  className,
  ref,
  ...props
}: ComponentPropsWithRef<typeof DialogPrimitive.Overlay>) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out fixed inset-0 z-110 bg-black/45 backdrop-blur-[2px]",
      className,
    )}
    {...props}
  />
);

type DialogContentProps = ComponentPropsWithRef<typeof DialogPrimitive.Content> & {
  overlayProps?: ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay> & {
    [key: `data-${string}`]: string | number | boolean | undefined;
  };
};

const DialogContent = ({ className, overlayProps, ref, ...props }: DialogContentProps) => (
  <DialogPortal>
    <DialogOverlay {...overlayProps} />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "border-latte-lavender/30 bg-latte-mantle/95 shadow-modal ring-latte-overlay2/25 data-[state=open]:animate-panel-enter data-[state=closed]:animate-panel-exit fixed left-[50%] top-[50%] z-110 w-[min(700px,calc(100vw-1rem))] translate-x-[-50%] translate-y-[-50%] rounded-3xl border p-3 ring-1 ring-inset sm:w-[min(700px,calc(100vw-1.5rem))] sm:p-4 md:p-5",
        className,
      )}
      {...props}
    />
  </DialogPortal>
);

const DialogHeader = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col gap-1.5", className)} {...props} />
);
DialogHeader.displayName = "DialogHeader";

const DialogTitle = ({
  className,
  ref,
  ...props
}: ComponentPropsWithRef<typeof DialogPrimitive.Title>) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("text-latte-text text-base font-semibold", className)}
    {...props}
  />
);

const DialogDescription = ({
  className,
  ref,
  ...props
}: ComponentPropsWithRef<typeof DialogPrimitive.Description>) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-latte-subtext0 text-sm", className)}
    {...props}
  />
);

export { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle };
