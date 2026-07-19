import type { ComponentPropsWithoutRef, ReactNode } from "react";

import { cn } from "@/lib/cn";

type PaneGridColumns = 1 | 2 | 3 | 4 | 5 | 6;
type PaneGridRows = 1 | 2;
type PaneGridGap = "compact" | "normal" | "wide";
type PaneGridResponsivePreset = "session-list" | "chat-grid";

type PaneGridLayoutProps = Omit<ComponentPropsWithoutRef<"div">, "children"> & {
  children: ReactNode;
  columns?: PaneGridColumns;
  rows?: PaneGridRows;
  gap?: PaneGridGap;
  responsivePreset?: PaneGridResponsivePreset;
};

const gapClassNameMap: Record<PaneGridGap, string> = {
  compact: "gap-2 sm:gap-3",
  normal: "gap-2.5 sm:gap-4",
  wide: "gap-3 sm:gap-5",
};

const columnClassNameMap: Record<PaneGridColumns, string> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4",
  5: "grid-cols-5",
  6: "grid-cols-6",
};

const rowClassNameMap: Record<PaneGridRows, string> = {
  1: "grid-rows-1",
  2: "grid-rows-2",
};

const responsivePresetClassNameMap: Record<PaneGridResponsivePreset, string> = {
  "session-list": "@lg:grid-cols-2 @3xl:grid-cols-3 @5xl:grid-cols-4 @lg:gap-5",
  "chat-grid": "md:grid-cols-2 xl:grid-cols-3 auto-rows-fr",
};

export const PaneGridLayout = ({
  children,
  className,
  columns,
  rows,
  gap = "normal",
  responsivePreset,
  ...rest
}: PaneGridLayoutProps) => {
  return (
    <div
      className={cn(
        "grid",
        gapClassNameMap[gap],
        responsivePreset ? responsivePresetClassNameMap[responsivePreset] : undefined,
        columns ? columnClassNameMap[columns] : undefined,
        rows ? rowClassNameMap[rows] : undefined,
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
};
