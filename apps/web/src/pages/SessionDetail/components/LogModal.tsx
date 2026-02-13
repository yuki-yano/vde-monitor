import type { SessionSummary } from "@vde-monitor/shared";
import { useAtom } from "jotai";
import { ArrowDown, ArrowRight, ExternalLink, X } from "lucide-react";
import {
  type ClipboardEvent,
  forwardRef,
  type HTMLAttributes,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";

import { Button, Callout, Card, IconButton, LoadingOverlay, Toolbar } from "@/components/ui";
import { sanitizeLogCopyText } from "@/lib/clipboard";

import { logModalDisplayLinesAtom, logModalIsAtBottomAtom } from "../atoms/logAtoms";
import { useStableVirtuosoScroll } from "../hooks/useStableVirtuosoScroll";

type LogModalState = {
  open: boolean;
  session: SessionSummary | null;
  logLines: string[];
  loading: boolean;
  error: string | null;
};

type LogModalActions = {
  onClose: () => void;
  onOpenHere: () => void;
  onOpenNewTab: () => void;
};

type LogModalProps = {
  state: LogModalState;
  actions: LogModalActions;
};

const QuickLogList = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      {...props}
      className={`text-latte-text w-max min-w-max px-2 py-1.5 font-mono text-[12px] leading-[16px] sm:px-3 sm:py-2 ${className ?? ""}`}
    />
  ),
);

QuickLogList.displayName = "QuickLogList";

export const LogModal = ({ state, actions }: LogModalProps) => {
  const { open, session, logLines, loading, error } = state;
  const { onClose, onOpenHere, onOpenNewTab } = actions;
  const virtuosoRef = useRef<VirtuosoHandle | null>(null);
  const [isAtBottom, setIsAtBottom] = useAtom(logModalIsAtBottomAtom);
  const [displayLines, setDisplayLines] = useAtom(logModalDisplayLinesAtom);
  const pendingLinesRef = useRef<string[] | null>(null);
  const isUserScrollingRef = useRef(false);
  const handleUserScrollStateChange = useCallback(
    (value: boolean) => {
      isUserScrollingRef.current = value;
      if (!value && pendingLinesRef.current) {
        setDisplayLines(pendingLinesRef.current);
        pendingLinesRef.current = null;
      }
    },
    [setDisplayLines],
  );
  const { scrollerRef, handleRangeChanged } = useStableVirtuosoScroll({
    items: displayLines,
    isAtBottom,
    enabled: open,
    onUserScrollStateChange: handleUserScrollStateChange,
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
    if (open && displayLines.length > 0) {
      // モーダルが開いたときに一番下にスクロール
      const timer = setTimeout(() => {
        virtuosoRef.current?.scrollToIndex({
          index: displayLines.length - 1,
          behavior: "auto",
          align: "end",
        });
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [open, displayLines.length]);

  useEffect(() => {
    if (!open) {
      pendingLinesRef.current = null;
      return;
    }
    if (isUserScrollingRef.current) {
      pendingLinesRef.current = logLines;
      return;
    }
    setDisplayLines(logLines);
    pendingLinesRef.current = null;
  }, [logLines, open, setDisplayLines]);

  const scrollToBottom = () => {
    virtuosoRef.current?.scrollToIndex({
      index: displayLines.length - 1,
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

  const handleCopy = useCallback((event: ClipboardEvent<HTMLDivElement>) => {
    const selection = window.getSelection?.();
    const raw = selection?.toString() ?? "";
    if (!raw) return;
    const sanitized = sanitizeLogCopyText(raw);
    if (sanitized === raw || !event.clipboardData) return;
    event.preventDefault();
    event.clipboardData.setData("text/plain", sanitized);
  }, []);

  if (!open || !session) return null;

  return (
    <div
      data-testid="log-modal-overlay"
      className="fixed inset-0 z-50"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        data-testid="log-modal-panel"
        className="absolute bottom-[72px] left-2.5 top-2.5 min-h-0 w-[min(900px,calc(100vw-1.25rem))] sm:bottom-[76px] sm:left-6 sm:top-4 sm:w-[min(900px,calc(100vw-3rem))]"
      >
        <Card className="font-body animate-panel-enter border-latte-lavender/30 bg-latte-mantle/85 shadow-accent-panel relative flex h-full min-h-0 flex-col overflow-hidden rounded-3xl border-2 p-3 ring-1 ring-inset ring-white/10 backdrop-blur-xl sm:p-4">
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
          <Toolbar className="gap-3 pr-10 sm:pr-12">
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
                <ArrowRight className="h-4 w-4" />
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
          <div
            className="border-latte-surface2/50 bg-latte-crust/60 shadow-inner-soft relative mt-2.5 flex min-h-0 w-full flex-1 rounded-2xl border sm:mt-3"
            onCopy={handleCopy}
          >
            {loading && <LoadingOverlay label="Loading log..." size="sm" />}
            <Virtuoso
              ref={virtuosoRef}
              data={displayLines}
              initialTopMostItemIndex={Math.max(displayLines.length - 1, 0)}
              followOutput="auto"
              atBottomStateChange={setIsAtBottom}
              rangeChanged={handleRangeChanged}
              components={{ Scroller: VirtuosoScroller, List: QuickLogList }}
              className="h-full w-full min-w-0 max-w-full"
              style={{ height: "100%" }}
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
    </div>
  );
};
