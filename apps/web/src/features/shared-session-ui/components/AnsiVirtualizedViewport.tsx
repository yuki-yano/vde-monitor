import { ArrowDown } from "lucide-react";
import {
  type ClipboardEvent,
  forwardRef,
  type HTMLAttributes,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  useCallback,
  useMemo,
} from "react";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";

import { IconButton, LoadingOverlay } from "@/components/ui";
import { cn } from "@/lib/cn";

type ScrollerComponent = (
  props: HTMLAttributes<HTMLDivElement> & { ref?: React.Ref<HTMLDivElement> },
) => ReactNode;

type AnsiVirtualizedViewportProps = {
  lines: string[];
  loading: boolean;
  loadingLabel: string;
  isAtBottom: boolean;
  onAtBottomChange: (value: boolean) => void;
  onRangeChanged?: (range: { startIndex: number; endIndex: number }) => void;
  followOutput?: "auto" | "smooth" | boolean;
  initialTopMostItemIndex?: number;
  virtuosoRef?: React.RefObject<VirtuosoHandle | null>;
  scroller?: ScrollerComponent;
  onScrollToBottom?: (behavior: "auto" | "smooth") => void;
  className?: string;
  viewportClassName?: string;
  listClassName?: string;
  lineClassName?: string;
  height?: string | number;
  sanitizeCopyText?: (raw: string) => string;
  onLineClick?: (event: MouseEvent<HTMLDivElement>) => void;
  onLineKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void;
};

const DefaultScroller = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      {...props}
      className={cn(
        "custom-scrollbar w-full min-w-0 max-w-full overflow-x-auto overflow-y-auto rounded-2xl",
        className,
      )}
    />
  ),
);

DefaultScroller.displayName = "DefaultScroller";

export const AnsiVirtualizedViewport = ({
  lines,
  loading,
  loadingLabel,
  isAtBottom,
  onAtBottomChange,
  onRangeChanged,
  followOutput = "auto",
  initialTopMostItemIndex,
  virtuosoRef,
  scroller,
  onScrollToBottom,
  className,
  viewportClassName,
  listClassName,
  lineClassName = "min-h-4 whitespace-pre leading-4",
  height = "100%",
  sanitizeCopyText,
  onLineClick,
  onLineKeyDown,
}: AnsiVirtualizedViewportProps) => {
  const ListComponent = useMemo(() => {
    const Component = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
      ({ className: nextClassName, ...props }, ref) => (
        <div ref={ref} {...props} className={cn(listClassName, nextClassName)} />
      ),
    );
    Component.displayName = "AnsiVirtualizedViewportList";
    return Component;
  }, [listClassName]);

  const handleCopy = useCallback(
    (event: ClipboardEvent<HTMLDivElement>) => {
      if (!sanitizeCopyText) {
        return;
      }
      const selection = window.getSelection?.();
      const raw = selection?.toString() ?? "";
      if (!raw) {
        return;
      }
      const sanitized = sanitizeCopyText(raw);
      if (sanitized === raw || !event.clipboardData) {
        return;
      }
      event.preventDefault();
      event.clipboardData.setData("text/plain", sanitized);
    },
    [sanitizeCopyText],
  );

  const scrollToBottom = useCallback(() => {
    if (onScrollToBottom) {
      onScrollToBottom("smooth");
      return;
    }
    virtuosoRef?.current?.scrollToIndex({
      index: Math.max(lines.length - 1, 0),
      behavior: "smooth",
      align: "end",
    });
  }, [lines.length, onScrollToBottom, virtuosoRef]);

  return (
    <div
      role="log"
      aria-label="Terminal output"
      className={className}
      onCopy={handleCopy}
      onClick={onLineClick}
      onKeyDown={onLineKeyDown}
    >
      {loading && <LoadingOverlay label={loadingLabel} />}
      <Virtuoso
        ref={virtuosoRef}
        data={lines}
        initialTopMostItemIndex={initialTopMostItemIndex ?? Math.max(lines.length - 1, 0)}
        followOutput={followOutput}
        atBottomStateChange={onAtBottomChange}
        rangeChanged={onRangeChanged}
        components={{
          Scroller: scroller ?? DefaultScroller,
          List: ListComponent,
        }}
        className={viewportClassName}
        style={{ height }}
        itemContent={(_index, line) => (
          <div className={lineClassName} dangerouslySetInnerHTML={{ __html: line || "&#x200B;" }} />
        )}
      />
      {!isAtBottom && (
        <IconButton
          type="button"
          onClick={scrollToBottom}
          aria-label="Scroll to bottom"
          className="absolute bottom-2 right-2"
          variant="base"
          size="sm"
        >
          <ArrowDown className="h-4 w-4" />
        </IconButton>
      )}
    </div>
  );
};
