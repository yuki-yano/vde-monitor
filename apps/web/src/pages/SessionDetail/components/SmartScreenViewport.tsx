import { ArrowDown } from "lucide-react";
import {
  type ClipboardEvent,
  type KeyboardEvent,
  type MouseEvent,
  type RefObject,
  type UIEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";

import { IconButton, LoadingOverlay } from "@/components/ui";
import { cn } from "@/lib/cn";

import type { SmartWrapLineClassification } from "../smart-wrap-classify";
import { decorateSmartWrapLines } from "../smart-wrap-decorator";

type SmartScreenViewportProps = {
  lines: string[];
  classifications: SmartWrapLineClassification[];
  loading: boolean;
  loadingLabel: string;
  isAtBottom: boolean;
  onAtBottomChange: (value: boolean) => void;
  onRangeChanged: (range: { startIndex: number; endIndex: number }) => void;
  scrollerRef: RefObject<HTMLDivElement | null>;
  onScrollToBottom: (behavior: "auto" | "smooth") => void;
  onUserScrollStateChange: (value: boolean) => void;
  sanitizeCopyText: (raw: string) => string;
  onLineClick: (event: MouseEvent<HTMLDivElement>) => void;
  onLineKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  height?: string | number;
};

const resolveIsAtBottom = (node: HTMLDivElement) =>
  node.scrollHeight - (node.scrollTop + node.clientHeight) <= 2;

export const SmartScreenViewport = ({
  lines,
  classifications,
  loading,
  loadingLabel,
  isAtBottom,
  onAtBottomChange,
  onRangeChanged,
  scrollerRef,
  onScrollToBottom,
  onUserScrollStateChange,
  sanitizeCopyText,
  onLineClick,
  onLineKeyDown,
  height = "100%",
}: SmartScreenViewportProps) => {
  const scrollEndTimerRef = useRef<number | null>(null);
  const decoratedLines = useMemo(
    () => decorateSmartWrapLines(lines, classifications),
    [classifications, lines],
  );

  useEffect(() => {
    if (lines.length === 0) {
      return;
    }
    onRangeChanged({ startIndex: 0, endIndex: lines.length - 1 });
  }, [lines.length, onRangeChanged]);

  useLayoutEffect(() => {
    if (!isAtBottom) {
      return;
    }
    const node = scrollerRef.current;
    if (!node) {
      return;
    }
    node.scrollTop = node.scrollHeight;
  }, [decoratedLines, isAtBottom, scrollerRef]);

  useEffect(() => {
    const node = scrollerRef.current;
    if (!node) {
      return;
    }
    onAtBottomChange(resolveIsAtBottom(node));
  }, [decoratedLines, onAtBottomChange, scrollerRef]);

  useEffect(
    () => () => {
      if (scrollEndTimerRef.current != null) {
        window.clearTimeout(scrollEndTimerRef.current);
      }
    },
    [],
  );

  const handleCopy = useCallback(
    (event: ClipboardEvent<HTMLDivElement>) => {
      const selection = window.getSelection?.();
      const raw = selection?.toString() ?? "";
      if (!raw) {
        return;
      }
      const sanitized = sanitizeCopyText(raw);
      if (!event.clipboardData || sanitized === raw) {
        return;
      }
      event.preventDefault();
      event.clipboardData.setData("text/plain", sanitized);
    },
    [sanitizeCopyText],
  );

  const handleScroll = useCallback(
    (event: UIEvent<HTMLDivElement>) => {
      const node = event.currentTarget;
      onAtBottomChange(resolveIsAtBottom(node));
      if (!event.isTrusted) {
        return;
      }
      onUserScrollStateChange(true);
      if (scrollEndTimerRef.current != null) {
        window.clearTimeout(scrollEndTimerRef.current);
      }
      scrollEndTimerRef.current = window.setTimeout(() => {
        onUserScrollStateChange(false);
        scrollEndTimerRef.current = null;
      }, 120);
    },
    [onAtBottomChange, onUserScrollStateChange],
  );

  const handleScrollToBottom = useCallback(() => onScrollToBottom("smooth"), [onScrollToBottom]);

  return (
    <div
      className="border-latte-surface2/80 bg-latte-crust/95 shadow-inner-soft relative min-h-[260px] w-full min-w-0 max-w-full flex-1 rounded-2xl border-2 sm:min-h-[320px]"
      onCopy={handleCopy}
    >
      {loading && <LoadingOverlay label={loadingLabel} />}
      <div
        ref={scrollerRef}
        data-testid="smart-screen-scroller"
        className="custom-scrollbar h-full w-full overflow-x-auto overflow-y-auto rounded-2xl"
        style={{ height }}
        onScroll={handleScroll}
      >
        <div
          data-testid="smart-screen-lines"
          role="log"
          className="text-latte-text w-full min-w-full max-w-full px-1 py-1 font-mono text-xs sm:px-2 sm:py-2"
          onClick={onLineClick}
          onKeyDown={onLineKeyDown}
        >
          {decoratedLines.map((line, index) => (
            <div
              key={index}
              data-index={index}
              className={cn("vde-screen-line-smart min-h-4 leading-4", line.className)}
              // lineHtml must come from the controlled screen pipeline
              // (server terminal output -> ansi escape -> DOM-only transforms),
              // never from unvalidated user input.
              dangerouslySetInnerHTML={{ __html: line.lineHtml || "&#x200B;" }}
            />
          ))}
        </div>
      </div>
      {!isAtBottom && (
        <IconButton
          type="button"
          onClick={handleScrollToBottom}
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
