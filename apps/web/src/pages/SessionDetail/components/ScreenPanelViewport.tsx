import {
  type HTMLAttributes,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type RefObject,
} from "react";
import type { VirtuosoHandle } from "react-virtuoso";

import { LoadingOverlay } from "@/components/ui";
import { AnsiVirtualizedViewport } from "@/features/shared-session-ui/components/AnsiVirtualizedViewport";
import { sanitizeLogCopyText } from "@/lib/clipboard";
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

  if (showImage) {
    return (
      <div className="border-latte-surface2/80 bg-latte-crust/95 shadow-inner-soft relative min-h-[260px] w-full min-w-0 max-w-full flex-1 rounded-2xl border-2 sm:min-h-[320px]">
        {isScreenLoading && <LoadingOverlay label="Loading screen..." />}
        <div className="flex w-full items-center justify-center p-1.5 sm:p-3">
          <img
            src={`data:image/png;base64,${imageBase64}`}
            alt="screen"
            className="border-latte-surface2 max-h-[480px] w-full rounded-xl border object-contain"
          />
        </div>
      </div>
    );
  }

  return (
    <AnsiVirtualizedViewport
      lines={screenLines}
      loading={isScreenLoading}
      loadingLabel="Loading screen..."
      isAtBottom={isAtBottom}
      onAtBottomChange={onAtBottomChange}
      onRangeChanged={onRangeChanged}
      virtuosoRef={virtuosoRef}
      scroller={VirtuosoScroller}
      onScrollToBottom={onScrollToBottom}
      className="border-latte-surface2/80 bg-latte-crust/95 shadow-inner-soft relative min-h-[260px] w-full min-w-0 max-w-full flex-1 rounded-2xl border-2 sm:min-h-[320px]"
      viewportClassName="w-full min-w-0 max-w-full"
      listClassName="text-latte-text w-max min-w-full px-1 py-1 font-mono text-xs sm:px-2 sm:py-2"
      lineClassName="min-h-4 whitespace-pre leading-4"
      height="60vh"
      sanitizeCopyText={sanitizeLogCopyText}
      onLineClick={onResolveFileReference}
      onLineKeyDown={onResolveFileReferenceKeyDown}
    />
  );
};
