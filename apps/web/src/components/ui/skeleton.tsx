import type { HTMLAttributes } from "react";

import { cn } from "@/lib/cn";

type SkeletonProps = HTMLAttributes<HTMLDivElement>;

const Skeleton = ({ className, ...props }: SkeletonProps) => (
  <div {...props} aria-hidden="true" className={cn("vde-skeleton rounded-full", className)} />
);

export { Skeleton };
