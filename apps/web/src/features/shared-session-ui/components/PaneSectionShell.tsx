import type { ReactNode } from "react";

import { Card } from "@/components/ui";
import { cn } from "@/lib/cn";

type PaneSectionShellProps = {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  status?: ReactNode;
  className?: string;
  headerTestId?: string;
  children: ReactNode;
};

export const PaneSectionShell = ({
  title,
  description,
  action,
  status,
  className,
  headerTestId,
  children,
}: PaneSectionShellProps) => {
  return (
    <Card className={cn("flex flex-col gap-2", className)}>
      <div data-testid={headerTestId} className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-latte-text text-base font-semibold tracking-tight">
            {title}
          </h2>
          {description ? (
            <p className="text-latte-subtext0 min-w-0 overflow-hidden text-sm">{description}</p>
          ) : null}
        </div>
        {action}
      </div>
      {status}
      {children}
    </Card>
  );
};
