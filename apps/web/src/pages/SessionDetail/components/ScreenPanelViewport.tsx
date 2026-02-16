import { ArrowDown } from "lucide-react";
import {
  forwardRef,
  type HTMLAttributes,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";

import { IconButton, LoadingOverlay } from "@/components/ui";
import type { ScreenMode } from "@/lib/screen-loading";

type ScreenPanelViewportProps = {
  mode: ScreenMode;
  imageBase64: string | null;
  isAtBottom: boolean;
  isScreenLoading: boolean;
  screenLines: string[];
  virtuosoRef: RefObject<VirtuosoHandle | null>;
  onAtBottomChange: (value: boolean) => void;
  onRangeChanged: (range: { startIndex: number; endIndex: number }) => void;
  VirtuosoScroller: (
    props: HTMLAttributes<HTMLDivElement> & { ref?: React.Ref<HTMLDivElement> },
  ) => ReactNode;
  onScrollToBottom: (behavior: "auto" | "smooth") => void;
  onResolveFileReference: (event: MouseEvent<HTMLDivElement>) => void;
  onResolveFileReferenceKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
};

const VirtuosoList = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      {...props}
      className={`text-latte-text w-max min-w-full px-1 py-1 font-mono text-xs sm:px-2 sm:py-2 ${className ?? ""}`}
    />
  ),
);

VirtuosoList.displayName = "VirtuosoList";

export const ScreenPanelViewport = ({
  mode,
  imageBase64,
  isAtBottom,
  isScreenLoading,
  screenLines,
  virtuosoRef,
  onAtBottomChange,
  onRangeChanged,
  VirtuosoScroller,
  onScrollToBottom,
  onResolveFileReference,
  onResolveFileReferenceKeyDown,
}: ScreenPanelViewportProps) => {
  const showImage = mode === "image" && Boolean(imageBase64);

  return (
    <div className="border-latte-surface2/80 bg-latte-crust/95 shadow-inner-soft relative min-h-[260px] w-full min-w-0 max-w-full flex-1 rounded-2xl border-2 sm:min-h-[320px]">
      {isScreenLoading && <LoadingOverlay label="Loading screen..." />}
      {showImage ? (
        <div className="flex w-full items-center justify-center p-1.5 sm:p-3">
          <img
            src={`data:image/png;base64,${imageBase64}`}
            alt="screen"
            className="border-latte-surface2 max-h-[480px] w-full rounded-xl border object-contain"
          />
        </div>
      ) : (
        <>
          <Virtuoso
            ref={virtuosoRef}
            data={screenLines}
            initialTopMostItemIndex={Math.max(screenLines.length - 1, 0)}
            followOutput="auto"
            atBottomStateChange={onAtBottomChange}
            rangeChanged={onRangeChanged}
            components={{ Scroller: VirtuosoScroller, List: VirtuosoList }}
            className="w-full min-w-0 max-w-full"
            style={{ height: "60vh" }}
            itemContent={(_index, line) => (
              <div
                className="min-h-4 whitespace-pre leading-4"
                onClick={onResolveFileReference}
                onKeyDown={onResolveFileReferenceKeyDown}
                dangerouslySetInnerHTML={{ __html: line || "&#x200B;" }}
              />
            )}
          />
          {!isAtBottom && (
            <IconButton
              type="button"
              onClick={() => onScrollToBottom("smooth")}
              aria-label="Scroll to bottom"
              className="absolute bottom-2 right-2"
              variant="base"
              size="sm"
            >
              <ArrowDown className="h-4 w-4" />
            </IconButton>
          )}
        </>
      )}
    </div>
  );
};
