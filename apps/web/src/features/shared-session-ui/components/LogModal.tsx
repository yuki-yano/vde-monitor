import type { SessionSummary } from "@vde-monitor/shared";
import { useAtom } from "jotai";
import { ArrowRight, ExternalLink, X } from "lucide-react";
import { forwardRef, type HTMLAttributes, useCallback, useEffect, useMemo, useRef } from "react";
import type { VirtuosoHandle } from "react-virtuoso";

import { Button, Callout, Card, IconButton, Toolbar } from "@/components/ui";
import { useWorkspaceTabs } from "@/features/pwa-tabs/context/workspace-tabs-context";
import {
  logModalDisplayLinesAtom,
  logModalIsAtBottomAtom,
} from "@/features/shared-session-ui/atoms/logAtoms";
import { AnsiVirtualizedViewport } from "@/features/shared-session-ui/components/AnsiVirtualizedViewport";
import { useStableVirtuosoScroll } from "@/features/shared-session-ui/hooks/useStableVirtuosoScroll";
import { resolveSessionDisplayTitle } from "@/features/shared-session-ui/model/session-display";
import { sanitizeLogCopyText } from "@/lib/clipboard";
import { cn } from "@/lib/cn";

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

export const LogModal = ({ state, actions }: LogModalProps) => {
  const { open, session, logLines, loading, error } = state;
  const { onClose, onOpenHere, onOpenNewTab } = actions;
  const { enabled: pwaTabsEnabled } = useWorkspaceTabs();
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
          className={cn(
            "custom-scrollbar w-full min-w-0 max-w-full overflow-x-auto overflow-y-auto overscroll-contain rounded-2xl",
            className,
          )}
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

  if (!open || !session) return null;

  return (
    <div
      data-testid="log-modal-overlay"
      data-log-modal-overlay="true"
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
                {resolveSessionDisplayTitle(session)}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={onOpenHere}
                aria-label="Open here"
                className="border-latte-lavender/40 text-latte-lavender hover:border-latte-lavender/60 hover:bg-latte-lavender/10 h-7 w-7 p-0"
              >
                <ArrowRight className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={onOpenNewTab}
                aria-label={pwaTabsEnabled ? "Open in workspace tab" : "Open in new tab"}
                className="border-latte-lavender/40 text-latte-lavender hover:border-latte-lavender/60 hover:bg-latte-lavender/10 h-7 w-7 p-0"
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
          <AnsiVirtualizedViewport
            lines={displayLines}
            loading={loading}
            loadingLabel="Loading log..."
            isAtBottom={isAtBottom}
            onAtBottomChange={setIsAtBottom}
            onRangeChanged={handleRangeChanged}
            virtuosoRef={virtuosoRef}
            scroller={VirtuosoScroller}
            onScrollToBottom={scrollToBottom}
            className="border-latte-surface2/50 bg-latte-crust/60 shadow-inner-soft relative mt-2.5 flex min-h-0 w-full flex-1 rounded-2xl border sm:mt-3"
            viewportClassName="h-full w-full min-w-0 max-w-full"
            listClassName="text-latte-text w-max min-w-max px-2 py-1.5 font-mono text-[12px] leading-[16px] sm:px-3 sm:py-2"
            lineClassName="min-h-4 whitespace-pre leading-5"
            height="100%"
            sanitizeCopyText={sanitizeLogCopyText}
          />
        </Card>
      </div>
    </div>
  );
};
