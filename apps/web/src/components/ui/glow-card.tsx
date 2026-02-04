import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/cn";

import { Card } from "./card";

type GlowCardProps = ComponentProps<typeof Card> & {
  contentClassName?: string;
  children: ReactNode;
};

const GlowCard = ({ className, contentClassName, children, ...props }: GlowCardProps) => {
  return (
    <Card
      className={cn(
        "shadow-glass border-latte-surface1/60 bg-latte-base/70 relative overflow-hidden rounded-3xl border p-5 backdrop-blur",
        className,
      )}
      {...props}
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-3xl">
        <div className="from-latte-lavender/10 to-latte-green/10 absolute inset-0 bg-gradient-to-br via-transparent" />
        <div className="bg-latte-lavender/20 absolute -top-24 right-0 h-48 w-48 rounded-full blur-3xl" />
        <div className="from-latte-lavender/70 via-latte-green/30 absolute inset-y-0 left-0 w-1 rounded-l-3xl bg-gradient-to-b to-transparent" />
      </div>
      <div className={cn("relative flex flex-col gap-4", contentClassName)}>{children}</div>
    </Card>
  );
};

export { GlowCard };
