import type { SessionSummary } from "@vde-monitor/shared";
import { ArrowDown, CornerDownLeft, ExternalLink, X } from "lucide-react";
import { forwardRef, type HTMLAttributes, useEffect, useMemo, useRef, useState } from "react";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";

import { Button, Callout, Card, IconButton, LoadingOverlay, Toolbar } from "@/components/ui";

import { useStableVirtuosoScroll } from "../hooks/useStableVirtuosoScroll";

type LogModalProps = {
  open: boolean;
  session: SessionSummary | null;
  logLines: string[];
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onOpenHere: () => void;
  onOpenNewTab: () => void;
};

const QuickLogList = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      {...props}
      className={`text-latte-text w-max min-w-max px-3 py-2 font-mono text-[12px] leading-[16px] ${className ?? ""}`}
    />
  ),
);

QuickLogList.displayName = "QuickLogList";

export const LogModal = ({
  open,
  session,
  logLines,
  loading,
  error,
  onClose,
  onOpenHere,
  onOpenNewTab,
}: LogModalProps) => {
  const virtuosoRef = useRef<VirtuosoHandle | null>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const { scrollerRef, handleRangeChanged } = useStableVirtuosoScroll({
    items: logLines,
    isAtBottom,
    enabled: open,
  });

  const VirtuosoScroller = useMemo(() => {
    const Component = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
      ({ className, ...props }, ref) => (
        <div
          ref={(node) => {
            if (typeof ref === "function") {
              ref(node);
            } else if (ref) {
              ref.current = node;
            }
            scrollerRef.current = node;
          }}
          {...props}
          className={`custom-scrollbar w-full min-w-0 max-w-full overflow-x-auto overflow-y-auto overscroll-contain rounded-2xl ${className ?? ""}`}
        />
      ),
    );
    Component.displayName = "VirtuosoScroller";
    return Component;
  }, [scrollerRef]);

  useEffect(() => {
    if (open && logLines.length > 0) {
      // モーダルが開いたときに一番下にスクロール
      const timer = setTimeout(() => {
        virtuosoRef.current?.scrollToIndex({
          index: logLines.length - 1,
          behavior: "auto",
          align: "end",
        });
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [open, logLines.length]);

  const scrollToBottom = () => {
    virtuosoRef.current?.scrollToIndex({
      index: logLines.length - 1,
      behavior: "smooth",
      align: "end",
    });
    if (scrollerRef.current) {
      scrollerRef.current.scrollTo({
        top: scrollerRef.current.scrollHeight,
        left: 0,
        behavior: "smooth",
      });
    }
  };

  if (!open || !session) return null;

  return (
    <div className="fixed bottom-[76px] left-6 z-50 w-[calc(100vw-3rem)] max-w-[480px]">
      <Card className="font-body animate-panel-enter border-latte-lavender/30 bg-latte-mantle/85 relative rounded-[28px] border-2 p-4 shadow-[0_25px_80px_-20px_rgba(114,135,253,0.4),0_0_0_1px_rgba(114,135,253,0.15)] ring-1 ring-inset ring-white/10 backdrop-blur-xl">
        <IconButton
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3"
          variant="lavender"
          size="sm"
          aria-label="Close log"
        >
          <X className="h-4 w-4" />
        </IconButton>
        <Toolbar className="gap-3 pr-12">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <p className="text-latte-text truncate text-base font-semibold">
              {session.customTitle ?? session.title ?? session.sessionName}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={onOpenHere}
              aria-label="Open here"
              className="border-latte-lavender/40 text-latte-lavender hover:border-latte-lavender/60 hover:bg-latte-lavender/10"
            >
              <CornerDownLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onOpenNewTab}
              aria-label="Open in new tab"
              className="border-latte-lavender/40 text-latte-lavender hover:border-latte-lavender/60 hover:bg-latte-lavender/10"
            >
              <ExternalLink className="h-4 w-4" />
            </Button>
          </div>
        </Toolbar>
        {error && (
          <Callout tone="error" size="xs" className="mt-2">
            {error}
          </Callout>
        )}
        <div className="border-latte-surface2/50 bg-latte-crust/60 relative mt-3 min-h-[200px] w-full rounded-2xl border shadow-inner">
          {loading && <LoadingOverlay label="Loading log..." size="sm" />}
          <Virtuoso
            ref={virtuosoRef}
            data={logLines}
            initialTopMostItemIndex={Math.max(logLines.length - 1, 0)}
            followOutput="auto"
            atBottomStateChange={setIsAtBottom}
            rangeChanged={handleRangeChanged}
            components={{ Scroller: VirtuosoScroller, List: QuickLogList }}
            className="w-full min-w-0 max-w-full"
            style={{ height: "72dvh", minHeight: "260px", maxHeight: "calc(100dvh - 10rem)" }}
            itemContent={(_index, line) => (
              <div
                className="min-h-4 whitespace-pre leading-5"
                dangerouslySetInnerHTML={{ __html: line || "&#x200B;" }}
              />
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
      </Card>
    </div>
  );
};
