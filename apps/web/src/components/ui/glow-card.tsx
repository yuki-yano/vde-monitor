import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/cn";

import { Card } from "./card";

type GlowCardProps = ComponentProps<typeof Card> & {
  contentClassName?: string;
  children: ReactNode;
};

const GlowCard = ({ className, contentClassName, children, ...props }: GlowCardProps) => {
  return (
    <Card className={cn("relative overflow-hidden rounded-3xl p-3 sm:p-5", className)} {...props}>
      <div className={cn("relative flex flex-col gap-4", contentClassName)}>{children}</div>
    </Card>
  );
};

export { GlowCard };
