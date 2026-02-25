import * as DialogPrimitive from "@radix-ui/react-dialog";
import type { ComponentPropsWithoutRef, ElementRef, HTMLAttributes } from "react";
import { forwardRef } from "react";

import { cn } from "@/lib/cn";

const Dialog = DialogPrimitive.Root;
const DialogPortal = DialogPrimitive.Portal;

const DialogOverlay = forwardRef<
  ElementRef<typeof DialogPrimitive.Overlay>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn("fixed inset-0 z-[110] bg-black/45 backdrop-blur-[2px]", className)}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

type DialogContentProps = ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
  overlayProps?: ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay> & {
    [key: `data-${string}`]: string | number | boolean | undefined;
  };
};

const DialogContent = forwardRef<ElementRef<typeof DialogPrimitive.Content>, DialogContentProps>(
  ({ className, overlayProps, ...props }, ref) => (
    <DialogPortal>
      <DialogOverlay {...overlayProps} />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          "border-latte-lavender/30 bg-latte-mantle/95 shadow-modal fixed left-[50%] top-[50%] z-[110] w-[min(700px,calc(100vw-1rem))] translate-x-[-50%] translate-y-[-50%] rounded-3xl border p-3 ring-1 ring-inset ring-white/10 sm:w-[min(700px,calc(100vw-1.5rem))] sm:p-4 md:p-5",
          className,
        )}
        {...props}
      />
    </DialogPortal>
  ),
);
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col gap-1.5", className)} {...props} />
);
DialogHeader.displayName = "DialogHeader";

const DialogTitle = forwardRef<
  ElementRef<typeof DialogPrimitive.Title>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("text-latte-text text-base font-semibold", className)}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = forwardRef<
  ElementRef<typeof DialogPrimitive.Description>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-latte-subtext0 text-sm", className)}
    {...props}
  />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle };
