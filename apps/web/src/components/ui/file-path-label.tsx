import type { HTMLAttributes, RefObject } from "react";
import { useMemo, useRef } from "react";

import {
  buildFullDir,
  buildPathInfo,
  normalizePath,
  useOverflowTruncate,
  useSegmentTruncate,
} from "@/components/ui/file-path-label-utils";
import { cn } from "@/lib/cn";

type FilePathLabelSize = "sm" | "xs";

type FilePathLabelProps = HTMLAttributes<HTMLDivElement> & {
  path: string;
  renamedFrom?: string | null;
  size?: FilePathLabelSize;
  tailSegments?: number;
  dirTruncate?: "start" | "end" | "segments";
  dirReservePx?: number;
  measureRef?: RefObject<HTMLElement | null>;
};

const sizeClass = {
  sm: {
    base: "text-sm",
    hint: "text-[11px]",
  },
  xs: {
    base: "text-xs",
    hint: "text-[10px]",
  },
};

const FilePathLabel = ({
  path,
  renamedFrom,
  size = "sm",
  tailSegments = 3,
  dirTruncate = "end",
  dirReservePx = 12,
  measureRef,
  className,
  ...props
}: FilePathLabelProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const baseInfo = buildPathInfo(path, tailSegments);
  const fullDir = buildFullDir(path);
  const dirSegments = useMemo(() => fullDir.split("/").filter(Boolean), [fullDir]);
  const { ref: dirMeasureRef, truncate: truncateDir } = useOverflowTruncate(fullDir);
  const dirSegmented = useSegmentTruncate({
    text: fullDir,
    segments: dirSegments,
    reservePx: dirReservePx,
    containerRef: containerRef,
    fallbackRef: measureRef,
  });
  const dirLabel =
    dirTruncate === "start"
      ? fullDir
      : dirTruncate === "segments"
        ? dirSegmented.label
        : truncateDir
          ? baseInfo.hint
          : fullDir;

  const fromInfo = renamedFrom ? buildPathInfo(renamedFrom, tailSegments) : null;
  const fullLabel = renamedFrom ? `${renamedFrom} → ${path}` : path;
  const fromFullLabel = renamedFrom ? normalizePath(renamedFrom) : "";
  const fromShortLabel = fromInfo
    ? `${fromInfo.hint ? `${fromInfo.hint}/` : ""}${fromInfo.base}`
    : (renamedFrom ?? "");
  const fromMeasureText = renamedFrom ? `from ${fromFullLabel}` : "";
  const { ref: fromMeasureRef, truncate: truncateFrom } = useOverflowTruncate(fromMeasureText);
  const fromSegments = useMemo(() => fromFullLabel.split("/").filter(Boolean), [fromFullLabel]);
  const fromSegmented = useSegmentTruncate({
    text: fromFullLabel,
    segments: fromSegments,
    reservePx: dirReservePx,
    containerRef: containerRef,
    fallbackRef: measureRef,
  });
  const fromLabel =
    dirTruncate === "start"
      ? fromFullLabel
      : dirTruncate === "segments"
        ? fromSegmented.label
        : truncateFrom
          ? fromShortLabel
          : fromFullLabel;

  const hintClass = cn(
    "text-latte-subtext0 block truncate",
    dirTruncate === "start" ? "text-left [direction:rtl] [unicode-bidi:plaintext]" : "",
    dirTruncate === "segments" ? "w-full" : "",
    sizeClass[size].hint,
  );
  const measureClass = cn(
    "text-latte-subtext0 block whitespace-nowrap",
    dirTruncate === "start" ? "text-left [direction:rtl] [unicode-bidi:plaintext]" : "",
    sizeClass[size].hint,
  );
  const measureWrapperClass =
    dirTruncate === "segments"
      ? "pointer-events-none invisible absolute left-0 top-0 w-max"
      : "pointer-events-none invisible absolute inset-0";

  return (
    <div ref={containerRef} className={cn("min-w-0", className)} {...props}>
      <span
        className={cn(
          "text-latte-text block truncate font-semibold leading-snug",
          sizeClass[size].base,
        )}
      >
        {baseInfo.base}
      </span>
      {renamedFrom ? (
        <div className="relative min-w-0">
          <span
            ref={dirTruncate === "segments" ? fromSegmented.measureRef : fromMeasureRef}
            aria-hidden
            className={cn(
              dirTruncate === "segments" ? measureClass : hintClass,
              measureWrapperClass,
            )}
          >
            {dirTruncate === "segments" ? fromFullLabel : fromMeasureText}
          </span>
          <span className={hintClass}>from {fromLabel}</span>
        </div>
      ) : (
        dirLabel && (
          <div className="relative min-w-0">
            <span
              ref={dirTruncate === "segments" ? dirSegmented.measureRef : dirMeasureRef}
              aria-hidden
              className={cn(
                dirTruncate === "segments" ? measureClass : hintClass,
                measureWrapperClass,
              )}
            >
              {fullDir}
            </span>
            <span className={hintClass}>{dirLabel}</span>
          </div>
        )
      )}
      <span className="sr-only">{fullLabel}</span>
    </div>
  );
};

export { FilePathLabel };
