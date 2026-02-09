import { ArrowDown, FileText, Image, RefreshCw } from "lucide-react";
import {
  type ClipboardEvent,
  forwardRef,
  type HTMLAttributes,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";

import {
  Button,
  Callout,
  Card,
  IconButton,
  LoadingOverlay,
  Tabs,
  TabsList,
  TabsTrigger,
  Toolbar,
} from "@/components/ui";
import { sanitizeLogCopyText } from "@/lib/clipboard";
import type { ScreenMode } from "@/lib/screen-loading";

import { useStableVirtuosoScroll } from "../hooks/useStableVirtuosoScroll";
import {
  extractLogReferenceTokensFromLine,
  linkifyLogLineFileReferences,
} from "../log-file-reference";
import { DISCONNECTED_MESSAGE } from "../sessionDetailUtils";

type ScreenPanelState = {
  mode: ScreenMode;
  connectionIssue: string | null;
  fallbackReason: string | null;
  error: string | null;
  contextLeftLabel: string | null;
  isScreenLoading: boolean;
  imageBase64: string | null;
  screenLines: string[];
  virtuosoRef: RefObject<VirtuosoHandle | null>;
  scrollerRef: RefObject<HTMLDivElement | null>;
  isAtBottom: boolean;
  forceFollow: boolean;
  rawMode: boolean;
  allowDangerKeys: boolean;
  fileResolveError: string | null;
};

type ScreenPanelActions = {
  onModeChange: (mode: ScreenMode) => void;
  onRefresh: () => void;
  onAtBottomChange: (value: boolean) => void;
  onScrollToBottom: (behavior: "auto" | "smooth") => void;
  onUserScrollStateChange: (value: boolean) => void;
  onResolveFileReference: (rawToken: string) => Promise<void>;
  onResolveFileReferenceCandidates: (rawTokens: string[]) => Promise<string[]>;
};

type ScreenPanelProps = {
  state: ScreenPanelState;
  actions: ScreenPanelActions;
  controls: ReactNode;
};

const shouldShowErrorMessage = (error: string | null, connectionIssue: string | null) =>
  Boolean(error) &&
  (!connectionIssue || (error !== connectionIssue && error !== DISCONNECTED_MESSAGE));

const VISIBLE_REFERENCE_LINE_PADDING = 20;
const FALLBACK_VISIBLE_REFERENCE_WINDOW = 120;

const resolveRawTokenFromEventTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) {
    return null;
  }
  const trigger = target.closest<HTMLElement>("[data-vde-file-ref]");
  return trigger?.dataset.vdeFileRef ?? null;
};

const resolveModeValue = (value: string): ScreenMode | null => {
  if (value === "text" || value === "image") {
    return value;
  }
  return null;
};

const handleModeValueChange = (
  value: string,
  currentMode: ScreenMode,
  onModeChange: (mode: ScreenMode) => void,
) => {
  const nextMode = resolveModeValue(value);
  if (!nextMode || nextMode === currentMode) {
    return;
  }
  onModeChange(nextMode);
};

const screenModeTabs = (mode: ScreenMode, onModeChange: (mode: ScreenMode) => void) => (
  <Tabs value={mode} onValueChange={(value) => handleModeValueChange(value, mode, onModeChange)}>
    <TabsList aria-label="Screen mode">
      <TabsTrigger value="text">
        <span className="inline-flex items-center gap-1.5">
          <FileText className="h-3.5 w-3.5" />
          <span>Text</span>
        </span>
      </TabsTrigger>
      <TabsTrigger value="image">
        <span className="inline-flex items-center gap-1.5">
          <Image className="h-3.5 w-3.5" />
          <span>Image</span>
        </span>
      </TabsTrigger>
    </TabsList>
  </Tabs>
);

const RawModeIndicator = ({
  rawMode,
  allowDangerKeys,
}: {
  rawMode: boolean;
  allowDangerKeys: boolean;
}) => {
  if (!rawMode) {
    return null;
  }
  return (
    <div className="border-latte-lavender/60 bg-latte-lavender/10 text-latte-lavender inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.3em] shadow-[inset_0_0_0_1px_rgba(114,135,253,0.12)]">
      Raw
      {allowDangerKeys && (
        <span className="bg-latte-red/20 text-latte-red rounded-full px-2 py-0.5 text-[9px] tracking-[0.24em]">
          Unsafe
        </span>
      )}
    </div>
  );
};

const ScreenContent = ({
  mode,
  imageBase64,
  isAtBottom,
  isScreenLoading,
  screenLines,
  virtuosoRef,
  onAtBottomChange,
  handleRangeChanged,
  VirtuosoScroller,
  onScrollToBottom,
  onResolveFileReference,
  onResolveFileReferenceKeyDown,
  onResolveFileReferenceHover,
  onResolveFileReferenceHoverLeave,
}: {
  mode: ScreenMode;
  imageBase64: string | null;
  isAtBottom: boolean;
  isScreenLoading: boolean;
  screenLines: string[];
  virtuosoRef: RefObject<VirtuosoHandle | null>;
  onAtBottomChange: (value: boolean) => void;
  handleRangeChanged: (range: { startIndex: number; endIndex: number }) => void;
  VirtuosoScroller: (
    props: HTMLAttributes<HTMLDivElement> & { ref?: React.Ref<HTMLDivElement> },
  ) => ReactNode;
  onScrollToBottom: (behavior: "auto" | "smooth") => void;
  onResolveFileReference: (event: MouseEvent<HTMLDivElement>) => void;
  onResolveFileReferenceKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  onResolveFileReferenceHover: (event: MouseEvent<HTMLDivElement>) => void;
  onResolveFileReferenceHoverLeave: () => void;
}) => {
  const showImage = mode === "image" && Boolean(imageBase64);

  return (
    <div className="border-latte-surface2/80 bg-latte-crust/95 relative min-h-[320px] w-full min-w-0 max-w-full flex-1 rounded-2xl border-2 shadow-inner">
      {isScreenLoading && <LoadingOverlay label="Loading screen..." />}
      {showImage ? (
        <div className="flex w-full items-center justify-center p-3">
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
            rangeChanged={handleRangeChanged}
            components={{ Scroller: VirtuosoScroller, List: VirtuosoList }}
            className="w-full min-w-0 max-w-full"
            style={{ height: "60vh" }}
            itemContent={(_index, line) => (
              <div
                className="min-h-4 whitespace-pre leading-4"
                onClick={onResolveFileReference}
                onKeyDown={onResolveFileReferenceKeyDown}
                onMouseMove={onResolveFileReferenceHover}
                onMouseLeave={onResolveFileReferenceHoverLeave}
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

const VirtuosoList = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      {...props}
      className={`text-latte-text w-max min-w-full px-2 py-2 font-mono text-xs ${className ?? ""}`}
    />
  ),
);

VirtuosoList.displayName = "VirtuosoList";

export const ScreenPanel = ({ state, actions, controls }: ScreenPanelProps) => {
  const {
    mode,
    connectionIssue,
    fallbackReason,
    error,
    contextLeftLabel,
    isScreenLoading,
    imageBase64,
    screenLines,
    virtuosoRef,
    scrollerRef,
    isAtBottom,
    forceFollow,
    rawMode,
    allowDangerKeys,
    fileResolveError,
  } = state;
  const {
    onModeChange,
    onRefresh,
    onAtBottomChange,
    onScrollToBottom,
    onUserScrollStateChange,
    onResolveFileReference,
    onResolveFileReferenceCandidates,
  } = actions;
  const showError = shouldShowErrorMessage(error, connectionIssue);
  const [linkableTokens, setLinkableTokens] = useState<Set<string>>(new Set());
  const [hoveredFileReferenceToken, setHoveredFileReferenceToken] = useState<string | null>(null);
  const [visibleRange, setVisibleRange] = useState<{ startIndex: number; endIndex: number } | null>(
    null,
  );
  const activeResolveCandidatesRequestIdRef = useRef(0);
  const hoveredFileReferenceTokenRef = useRef<string | null>(null);

  const updateHoveredFileReferenceToken = useCallback((nextToken: string | null) => {
    if (hoveredFileReferenceTokenRef.current === nextToken) {
      return;
    }
    hoveredFileReferenceTokenRef.current = nextToken;
    setHoveredFileReferenceToken(nextToken);
  }, []);
  const referenceCandidateTokens = useMemo(() => {
    if (mode !== "text") {
      return [];
    }
    if (screenLines.length === 0) {
      return [];
    }
    const seen = new Set<string>();
    const ordered: string[] = [];
    const maxIndex = screenLines.length - 1;
    const fallbackStart = Math.max(0, maxIndex - FALLBACK_VISIBLE_REFERENCE_WINDOW);
    const startIndex =
      visibleRange == null
        ? fallbackStart
        : Math.max(0, visibleRange.startIndex - VISIBLE_REFERENCE_LINE_PADDING);
    const endIndex =
      visibleRange == null
        ? maxIndex
        : Math.min(maxIndex, visibleRange.endIndex + VISIBLE_REFERENCE_LINE_PADDING);

    for (let index = endIndex; index >= startIndex; index -= 1) {
      const line = screenLines[index];
      if (!line) {
        continue;
      }
      const tokens = extractLogReferenceTokensFromLine(line);
      const pathTokens: string[] = [];
      const filenameTokens: string[] = [];
      for (const token of tokens) {
        if (seen.has(token)) {
          continue;
        }
        if (token.includes("/") || token.includes("\\")) {
          pathTokens.push(token);
          continue;
        }
        filenameTokens.push(token);
      }
      for (const token of [...pathTokens, ...filenameTokens]) {
        seen.add(token);
        ordered.push(token);
      }
    }
    return ordered;
  }, [mode, screenLines, visibleRange]);
  const referenceCandidateTokenSet = useMemo(
    () => new Set(referenceCandidateTokens),
    [referenceCandidateTokens],
  );
  const linkifiedScreenLines = useMemo(() => {
    if (mode !== "text" || linkableTokens.size === 0) {
      return screenLines;
    }
    return screenLines.map((line) =>
      linkifyLogLineFileReferences(line, {
        isLinkableToken: (rawToken) => linkableTokens.has(rawToken),
        isActiveToken: (rawToken) => hoveredFileReferenceToken === rawToken,
      }),
    );
  }, [hoveredFileReferenceToken, linkableTokens, mode, screenLines]);

  useEffect(() => {
    const requestId = activeResolveCandidatesRequestIdRef.current + 1;
    activeResolveCandidatesRequestIdRef.current = requestId;

    if (referenceCandidateTokens.length === 0) {
      setLinkableTokens(new Set());
      return;
    }

    void onResolveFileReferenceCandidates(referenceCandidateTokens)
      .then((resolvedTokens) => {
        if (activeResolveCandidatesRequestIdRef.current !== requestId) {
          return;
        }
        const resolvedTokenSet = new Set(resolvedTokens);
        setLinkableTokens((previous) => {
          const next = new Set<string>();
          referenceCandidateTokens.forEach((token) => {
            if (resolvedTokenSet.has(token) || previous.has(token)) {
              next.add(token);
            }
          });
          return next;
        });
      })
      .catch(() => {
        if (activeResolveCandidatesRequestIdRef.current !== requestId) {
          return;
        }
        setLinkableTokens((previous) => {
          const next = new Set<string>();
          previous.forEach((token) => {
            if (referenceCandidateTokenSet.has(token)) {
              next.add(token);
            }
          });
          return next;
        });
      });
  }, [onResolveFileReferenceCandidates, referenceCandidateTokenSet, referenceCandidateTokens]);
  const { scrollerRef: stableScrollerRef, handleRangeChanged } = useStableVirtuosoScroll({
    items: screenLines,
    isAtBottom,
    enabled: mode === "text",
    scrollerRef,
    isUserScrolling: forceFollow,
    onUserScrollStateChange,
  });
  const handleScreenRangeChanged = useCallback(
    (range: { startIndex: number; endIndex: number }) => {
      setVisibleRange(range);
      handleRangeChanged(range);
    },
    [handleRangeChanged],
  );

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
            stableScrollerRef.current = node;
          }}
          {...props}
          className={`custom-scrollbar w-full min-w-0 max-w-full overflow-x-auto overflow-y-auto rounded-2xl ${className ?? ""}`}
        />
      ),
    );
    Component.displayName = "VirtuosoScroller";
    return Component;
  }, [stableScrollerRef]);

  const handleCopy = useCallback((event: ClipboardEvent<HTMLDivElement>) => {
    const selection = window.getSelection?.();
    const raw = selection?.toString() ?? "";
    if (!raw) return;
    const sanitized = sanitizeLogCopyText(raw);
    if (sanitized === raw || !event.clipboardData) return;
    event.preventDefault();
    event.clipboardData.setData("text/plain", sanitized);
  }, []);

  const handleResolveFileReference = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      const rawToken = resolveRawTokenFromEventTarget(event.target);
      if (!rawToken) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      void onResolveFileReference(rawToken);
    },
    [onResolveFileReference],
  );

  const handleResolveFileReferenceKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }
      const rawToken = resolveRawTokenFromEventTarget(event.target);
      if (!rawToken) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      void onResolveFileReference(rawToken);
    },
    [onResolveFileReference],
  );

  const handleResolveFileReferenceHover = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      const rawToken = resolveRawTokenFromEventTarget(event.target);
      updateHoveredFileReferenceToken(rawToken);
    },
    [updateHoveredFileReferenceToken],
  );

  const handleResolveFileReferenceHoverLeave = useCallback(() => {
    updateHoveredFileReferenceToken(null);
  }, [updateHoveredFileReferenceToken]);

  return (
    <Card className="flex min-w-0 flex-col gap-3 p-4">
      <Toolbar className="gap-3">
        <div className="flex items-center gap-2">{screenModeTabs(mode, onModeChange)}</div>
        <div className="flex items-center gap-2">
          <RawModeIndicator rawMode={rawMode} allowDangerKeys={allowDangerKeys} />
          <Button variant="ghost" size="sm" onClick={onRefresh} aria-label="Refresh screen">
            <RefreshCw className="h-4 w-4" />
            <span className="sr-only">Refresh</span>
          </Button>
        </div>
      </Toolbar>
      {fallbackReason && (
        <Callout tone="warning" size="xs">
          Image fallback: {fallbackReason}
        </Callout>
      )}
      {showError && (
        <Callout tone="error" size="xs">
          {error}
        </Callout>
      )}
      {fileResolveError && (
        <Callout tone="error" size="xs">
          {fileResolveError}
        </Callout>
      )}
      <div onCopy={handleCopy}>
        <ScreenContent
          mode={mode}
          imageBase64={imageBase64}
          isAtBottom={isAtBottom}
          isScreenLoading={isScreenLoading}
          screenLines={linkifiedScreenLines}
          virtuosoRef={virtuosoRef}
          onAtBottomChange={onAtBottomChange}
          handleRangeChanged={handleScreenRangeChanged}
          VirtuosoScroller={VirtuosoScroller}
          onScrollToBottom={onScrollToBottom}
          onResolveFileReference={handleResolveFileReference}
          onResolveFileReferenceKeyDown={handleResolveFileReferenceKeyDown}
          onResolveFileReferenceHover={handleResolveFileReferenceHover}
          onResolveFileReferenceHoverLeave={handleResolveFileReferenceHoverLeave}
        />
      </div>
      {contextLeftLabel ? (
        <div className="-mt-1 flex justify-end">
          <span className="text-latte-subtext0 px-1 text-[12px] font-medium tracking-[0.14em]">
            {contextLeftLabel}
          </span>
        </div>
      ) : null}
      <div>{controls}</div>
    </Card>
  );
};
