import type { WorktreeListEntry } from "@vde-monitor/shared";
import {
  ArrowDown,
  Check,
  ChevronsUpDown,
  FileText,
  GitBranch,
  Image,
  RefreshCw,
  X,
} from "lucide-react";
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
  TagPill,
  Toolbar,
  TruncatedSegmentText,
} from "@/components/ui";
import { sanitizeLogCopyText } from "@/lib/clipboard";
import type { ScreenMode } from "@/lib/screen-loading";

import { useStableVirtuosoScroll } from "../hooks/useStableVirtuosoScroll";
import {
  extractLogReferenceTokensFromLine,
  linkifyLogLineFileReferences,
} from "../log-file-reference";
import { DISCONNECTED_MESSAGE, formatBranchLabel } from "../sessionDetailUtils";

type ScreenPanelState = {
  mode: ScreenMode;
  connectionIssue: string | null;
  fallbackReason: string | null;
  error: string | null;
  pollingPauseReason: "disconnected" | "unauthorized" | "offline" | "hidden" | null;
  promptGitContext: {
    branch: string | null;
    fileChanges: {
      add: number;
      m: number;
      d: number;
    } | null;
    additions: number | null;
    deletions: number | null;
  } | null;
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
  worktreeSelectorEnabled: boolean;
  worktreeSelectorLoading: boolean;
  worktreeSelectorError: string | null;
  worktreeEntries: WorktreeListEntry[];
  worktreeRepoRoot: string | null;
  worktreeBaseBranch: string | null;
  actualWorktreePath: string | null;
  virtualWorktreePath: string | null;
};

type ScreenPanelActions = {
  onModeChange: (mode: ScreenMode) => void;
  onRefresh: () => void;
  onRefreshWorktrees?: () => void;
  onAtBottomChange: (value: boolean) => void;
  onScrollToBottom: (behavior: "auto" | "smooth") => void;
  onUserScrollStateChange: (value: boolean) => void;
  onSelectVirtualWorktree?: (path: string) => void;
  onClearVirtualWorktree?: () => void;
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

const formatGitMetric = (value: number | null) => (value == null ? "—" : String(value));
const LEADING_TRUNCATE_CLASS_NAME =
  "block w-full min-w-0 overflow-hidden whitespace-nowrap text-left font-mono";

const truncateTextFromStartByWidth = (
  value: string,
  maxWidth: number,
  measureWidth: (text: string) => number,
) => {
  if (!value || maxWidth <= 0) {
    return value;
  }
  if (measureWidth(value) <= maxWidth) {
    return value;
  }
  if (measureWidth("…") > maxWidth) {
    return "";
  }
  let low = 1;
  let high = value.length;
  let best = "…";
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const candidate = `…${value.slice(mid)}`;
    if (measureWidth(candidate) <= maxWidth) {
      best = candidate;
      high = mid - 1;
      continue;
    }
    low = mid + 1;
  }
  return best;
};

const buildVisibleFileChangeCategories = (
  fileChanges: { add: number; m: number; d: number } | null | undefined,
) =>
  [
    {
      key: "add",
      label: "A",
      value: fileChanges?.add ?? 0,
      className: "text-latte-green",
    },
    {
      key: "m",
      label: "M",
      value: fileChanges?.m ?? 0,
      className: "text-latte-yellow",
    },
    {
      key: "d",
      label: "D",
      value: fileChanges?.d ?? 0,
      className: "text-latte-red",
    },
  ].filter((item) => item.value > 0);

const formatWorktreeFlag = (value: boolean | null) => {
  if (value == null) {
    return "Unknown";
  }
  return value ? "Yes" : "No";
};

const hasWorktreeUpstreamDelta = (value: number | null | undefined) =>
  typeof value === "number" && value > 0;

const normalizeSlashPath = (value: string) => {
  const normalized = value.replace(/\\/g, "/").replace(/\/+$/, "");
  if (normalized.length > 0) {
    return normalized;
  }
  return "/";
};

const formatRelativeWorktreePath = (entryPath: string, repoRoot: string | null) => {
  if (!repoRoot) {
    return entryPath;
  }
  const normalizedEntryPath = normalizeSlashPath(entryPath);
  const normalizedRepoRoot = normalizeSlashPath(repoRoot);
  if (normalizedEntryPath === normalizedRepoRoot) {
    return ".";
  }
  if (normalizedEntryPath.startsWith(`${normalizedRepoRoot}/`)) {
    return normalizedEntryPath.slice(normalizedRepoRoot.length + 1);
  }
  return entryPath;
};

const resolveWorktreeFlagClassName = (
  kind: "dirty" | "locked" | "merged",
  value: boolean | null,
) => {
  if (value == null) {
    return "border-latte-surface2/70 bg-latte-surface0/60 text-latte-subtext0";
  }
  if (kind === "dirty") {
    return value
      ? "border-latte-red/45 bg-latte-red/10 text-latte-red"
      : "border-latte-green/45 bg-latte-green/10 text-latte-green";
  }
  if (kind === "locked") {
    return value
      ? "border-latte-yellow/45 bg-latte-yellow/12 text-latte-yellow"
      : "border-latte-green/45 bg-latte-green/10 text-latte-green";
  }
  return value
    ? "border-latte-green/45 bg-latte-green/10 text-latte-green"
    : "border-latte-yellow/45 bg-latte-yellow/12 text-latte-yellow";
};

const resolveWorktreePrStatus = (
  prStatus: WorktreeListEntry["prStatus"] | null | undefined,
): { label: string; className: string } => {
  switch (prStatus) {
    case "none":
      return {
        label: "PR None",
        className: "border-latte-peach/45 bg-latte-peach/12 text-latte-peach",
      };
    case "open":
      return {
        label: "PR Open",
        className: "border-latte-blue/45 bg-latte-blue/10 text-latte-blue",
      };
    case "merged":
      return {
        label: "PR Merged",
        className: "border-latte-green/45 bg-latte-green/10 text-latte-green",
      };
    case "closed_unmerged":
      return {
        label: "PR Closed",
        className: "border-latte-red/45 bg-latte-red/10 text-latte-red",
      };
    case "unknown":
    default:
      return {
        label: "PR Unknown",
        className: "border-latte-surface2/70 bg-latte-surface0/60 text-latte-subtext0",
      };
  }
};

const pollingPauseLabelMap: Record<
  NonNullable<ScreenPanelState["pollingPauseReason"]>,
  { label: string; className: string }
> = {
  disconnected: {
    label: "RECONNECTING...",
    className: "border-latte-red/50 bg-latte-red/12 text-latte-red animate-pulse",
  },
  unauthorized: {
    label: "PAUSED (auth required)",
    className: "border-latte-red/45 bg-latte-red/10 text-latte-red",
  },
  offline: {
    label: "PAUSED (offline)",
    className: "border-latte-yellow/45 bg-latte-yellow/10 text-latte-yellow",
  },
  hidden: {
    label: "PAUSED (tab hidden)",
    className: "border-latte-yellow/45 bg-latte-yellow/10 text-latte-yellow",
  },
};

const VISIBLE_REFERENCE_LINE_PADDING = 20;
const FALLBACK_VISIBLE_REFERENCE_WINDOW = 120;
const CONTEXT_ROW_GUARD_PX = 12;
const BRANCH_LABEL_WIDTH_GUARD_PX = 2;
const WORKTREE_SELECTOR_BRANCH_CHROME_PX = 48;
const BRANCH_PILL_CHROME_PX = 34;
const WORKTREE_SELECTOR_OPEN_BODY_DATASET_KEY = "vdeWorktreeSelectorOpen";
const WORKTREE_SELECTOR_REFRESH_INTERVAL_MS = 10_000;

const parseGapPx = (value: string) => {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return parsed;
};

const measureFlexChildrenTotalWidth = (node: HTMLElement) => {
  const children = Array.from(node.children).filter(
    (child): child is HTMLElement => child instanceof HTMLElement,
  );
  if (children.length === 0) {
    return 0;
  }
  const styles = window.getComputedStyle(node);
  const gap = parseGapPx(styles.columnGap || styles.gap || "0");
  const childrenWidth = children.reduce((total, child) => {
    return total + child.getBoundingClientRect().width;
  }, 0);
  return childrenWidth + gap * Math.max(children.length - 1, 0);
};

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
    <div className="border-latte-lavender/60 bg-latte-lavender/10 text-latte-lavender shadow-accent-inset inline-flex items-center gap-2 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.3em] sm:px-3 sm:py-1">
      Raw
      {allowDangerKeys && (
        <span className="bg-latte-red/20 text-latte-red rounded-full px-1.5 py-0.5 text-[9px] tracking-[0.24em] sm:px-2">
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
}) => {
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
            rangeChanged={handleRangeChanged}
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

export const ScreenPanel = ({ state, actions, controls }: ScreenPanelProps) => {
  const {
    mode,
    connectionIssue,
    fallbackReason,
    error,
    pollingPauseReason,
    promptGitContext,
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
    worktreeSelectorEnabled,
    worktreeSelectorLoading,
    worktreeSelectorError,
    worktreeEntries,
    worktreeRepoRoot,
    worktreeBaseBranch,
    actualWorktreePath,
    virtualWorktreePath,
  } = state;
  const {
    onModeChange,
    onRefresh,
    onRefreshWorktrees,
    onAtBottomChange,
    onScrollToBottom,
    onUserScrollStateChange,
    onSelectVirtualWorktree,
    onClearVirtualWorktree,
    onResolveFileReference,
    onResolveFileReferenceCandidates,
  } = actions;
  const showError = shouldShowErrorMessage(error, connectionIssue);
  const pollingPauseMeta = pollingPauseReason ? pollingPauseLabelMap[pollingPauseReason] : null;
  const gitBranchLabel = formatBranchLabel(promptGitContext?.branch);
  const gitFileChanges = promptGitContext?.fileChanges;
  const gitAdditionsLabel = formatGitMetric(promptGitContext?.additions ?? null);
  const gitDeletionsLabel = formatGitMetric(promptGitContext?.deletions ?? null);
  const isVirtualActive = Boolean(virtualWorktreePath);
  const [isWorktreeSelectorOpen, setIsWorktreeSelectorOpen] = useState(false);
  const lastWorktreeSelectorClosedAtRef = useRef(Date.now());
  const [isContextInStatusRow, setIsContextInStatusRow] = useState(false);
  const [displayGitBranchLabel, setDisplayGitBranchLabel] = useState(gitBranchLabel);
  const [isBranchLabelConstrained, setIsBranchLabelConstrained] = useState(false);
  const promptGitContextRowRef = useRef<HTMLDivElement | null>(null);
  const promptGitContextLeftRef = useRef<HTMLDivElement | null>(null);
  const contextLabelMeasureRef = useRef<HTMLSpanElement | null>(null);
  const branchPillContainerRef = useRef<HTMLDivElement | null>(null);
  const branchLabelSlotRef = useRef<HTMLSpanElement | null>(null);
  const branchLabelMeasureRef = useRef<HTMLSpanElement | null>(null);
  const visibleFileChangeCategories = useMemo(
    () => buildVisibleFileChangeCategories(gitFileChanges),
    [gitFileChanges],
  );
  const displayedWorktreeEntries = useMemo(() => {
    if (!worktreeRepoRoot) {
      return worktreeEntries;
    }
    const repoRootEntries: WorktreeListEntry[] = [];
    const otherEntries: WorktreeListEntry[] = [];
    worktreeEntries.forEach((entry) => {
      if (entry.path === worktreeRepoRoot) {
        repoRootEntries.push(entry);
        return;
      }
      otherEntries.push(entry);
    });
    return [...repoRootEntries, ...otherEntries];
  }, [worktreeEntries, worktreeRepoRoot]);
  const showBlockingWorktreeLoading = worktreeSelectorLoading && worktreeEntries.length === 0;
  const visibleFileChangeCategoriesKey = useMemo(
    () => visibleFileChangeCategories.map((item) => `${item.key}:${item.value}`).join("|"),
    [visibleFileChangeCategories],
  );
  const [linkableTokens, setLinkableTokens] = useState<Set<string>>(new Set());
  const [visibleRange, setVisibleRange] = useState<{ startIndex: number; endIndex: number } | null>(
    null,
  );
  const activeResolveCandidatesRequestIdRef = useRef(0);
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
  const refreshWorktrees = useCallback(() => {
    if (onRefreshWorktrees) {
      onRefreshWorktrees();
      return;
    }
    onRefresh();
  }, [onRefresh, onRefreshWorktrees]);

  useEffect(() => {
    if (!worktreeSelectorEnabled && isWorktreeSelectorOpen) {
      setIsWorktreeSelectorOpen(false);
    }
  }, [isWorktreeSelectorOpen, worktreeSelectorEnabled]);

  useEffect(() => {
    if (!worktreeSelectorEnabled) {
      return;
    }
    if (!isWorktreeSelectorOpen) {
      lastWorktreeSelectorClosedAtRef.current = Date.now();
      return;
    }
    const elapsedSinceCloseMs = Date.now() - lastWorktreeSelectorClosedAtRef.current;
    if (elapsedSinceCloseMs >= WORKTREE_SELECTOR_REFRESH_INTERVAL_MS) {
      refreshWorktrees();
    }
    const timerId = window.setInterval(() => {
      refreshWorktrees();
    }, WORKTREE_SELECTOR_REFRESH_INTERVAL_MS);
    return () => {
      window.clearInterval(timerId);
    };
  }, [isWorktreeSelectorOpen, refreshWorktrees, worktreeSelectorEnabled]);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }
    const { body } = document;
    if (isWorktreeSelectorOpen) {
      body.dataset[WORKTREE_SELECTOR_OPEN_BODY_DATASET_KEY] = "true";
    } else {
      delete body.dataset[WORKTREE_SELECTOR_OPEN_BODY_DATASET_KEY];
    }
    return () => {
      delete body.dataset[WORKTREE_SELECTOR_OPEN_BODY_DATASET_KEY];
    };
  }, [isWorktreeSelectorOpen]);

  const evaluateBranchLabelPlacement = useCallback(() => {
    const leftNode = promptGitContextLeftRef.current;
    const containerNode = branchPillContainerRef.current;
    const measureNode = branchLabelMeasureRef.current;
    if (!leftNode || !containerNode || !measureNode) {
      return;
    }
    const children = Array.from(leftNode.children).filter(
      (child): child is HTMLElement => child instanceof HTMLElement,
    );
    const styles = window.getComputedStyle(leftNode);
    const gap = parseGapPx(styles.columnGap || styles.gap || "0");
    const siblingsWidth = children.reduce((total, child) => {
      if (child === containerNode) {
        return total;
      }
      return total + child.getBoundingClientRect().width;
    }, 0);
    const availableWidth = Math.max(
      0,
      Math.floor(
        leftNode.getBoundingClientRect().width -
          siblingsWidth -
          gap * Math.max(children.length - 1, 0),
      ) - BRANCH_LABEL_WIDTH_GUARD_PX,
    );
    if (availableWidth <= 0) {
      return;
    }
    const chromeWidth = worktreeSelectorEnabled
      ? WORKTREE_SELECTOR_BRANCH_CHROME_PX
      : BRANCH_PILL_CHROME_PX;
    const maxLabelWidth = Math.max(0, availableWidth - chromeWidth);
    measureNode.textContent = gitBranchLabel;
    const fullLabelWidth = measureNode.getBoundingClientRect().width;
    const needsConstraint = fullLabelWidth > maxLabelWidth;
    const nextLabel = needsConstraint
      ? truncateTextFromStartByWidth(gitBranchLabel, maxLabelWidth, (text) => {
          measureNode.textContent = text;
          return measureNode.getBoundingClientRect().width;
        })
      : gitBranchLabel;
    setIsBranchLabelConstrained((previous) =>
      previous === needsConstraint ? previous : needsConstraint,
    );
    setDisplayGitBranchLabel((previous) => (previous === nextLabel ? previous : nextLabel));
  }, [gitBranchLabel, worktreeSelectorEnabled]);

  const branchLabelSlotClassName = isBranchLabelConstrained ? "min-w-0 flex-1 basis-0" : "min-w-0";

  const branchTriggerWidthClassName = isBranchLabelConstrained ? "w-full" : "w-auto";
  const branchContainerClassName = isBranchLabelConstrained
    ? "relative min-w-0 flex-1"
    : "relative min-w-0 shrink-0";

  useEffect(() => {
    setDisplayGitBranchLabel(gitBranchLabel);
    setIsBranchLabelConstrained(false);
  }, [gitBranchLabel]);

  useEffect(() => {
    evaluateBranchLabelPlacement();
    if (typeof window === "undefined") {
      return;
    }
    const rowNode = promptGitContextRowRef.current;
    const leftNode = promptGitContextLeftRef.current;
    const containerNode = branchPillContainerRef.current;
    if (!rowNode && !leftNode && !containerNode) {
      return;
    }
    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            evaluateBranchLabelPlacement();
          });
    if (rowNode) {
      resizeObserver?.observe(rowNode);
    }
    if (leftNode) {
      resizeObserver?.observe(leftNode);
    }
    if (containerNode) {
      resizeObserver?.observe(containerNode);
    }
    const rafId = window.requestAnimationFrame(() => {
      evaluateBranchLabelPlacement();
    });
    const onResize = () => {
      evaluateBranchLabelPlacement();
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener("resize", onResize);
      resizeObserver?.disconnect();
    };
  }, [evaluateBranchLabelPlacement]);

  useEffect(() => {
    evaluateBranchLabelPlacement();
  }, [
    evaluateBranchLabelPlacement,
    gitAdditionsLabel,
    gitDeletionsLabel,
    isVirtualActive,
    visibleFileChangeCategoriesKey,
  ]);

  const evaluateContextLabelPlacement = useCallback(() => {
    if (!contextLeftLabel) {
      setIsContextInStatusRow(false);
      return;
    }
    const rowWidth = promptGitContextRowRef.current?.clientWidth ?? 0;
    const leftNode = promptGitContextLeftRef.current;
    const leftWidth = leftNode ? measureFlexChildrenTotalWidth(leftNode) : 0;
    const contextWidth = contextLabelMeasureRef.current?.offsetWidth ?? 0;
    if (rowWidth <= 0 || contextWidth <= 0) {
      return;
    }
    const requiredWidth = leftWidth + contextWidth + 12;
    const needsStatusRow = isContextInStatusRow
      ? requiredWidth > rowWidth - CONTEXT_ROW_GUARD_PX
      : requiredWidth > rowWidth;
    setIsContextInStatusRow((previous) =>
      previous === needsStatusRow ? previous : needsStatusRow,
    );
  }, [contextLeftLabel, isContextInStatusRow]);

  useEffect(() => {
    evaluateContextLabelPlacement();
    if (typeof window === "undefined") {
      return;
    }
    const row = promptGitContextRowRef.current;
    const left = promptGitContextLeftRef.current;
    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            evaluateContextLabelPlacement();
          });
    if (row) {
      resizeObserver?.observe(row);
    }
    if (left) {
      resizeObserver?.observe(left);
    }
    const rafId = window.requestAnimationFrame(() => {
      evaluateContextLabelPlacement();
    });
    const onResize = () => {
      evaluateContextLabelPlacement();
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener("resize", onResize);
      resizeObserver?.disconnect();
    };
  }, [
    contextLeftLabel,
    displayGitBranchLabel,
    evaluateContextLabelPlacement,
    gitAdditionsLabel,
    gitDeletionsLabel,
    isVirtualActive,
    visibleFileChangeCategoriesKey,
  ]);
  const linkifiedScreenLines = useMemo(() => {
    if (mode !== "text" || linkableTokens.size === 0) {
      return screenLines;
    }
    return screenLines.map((line) =>
      linkifyLogLineFileReferences(line, {
        isLinkableToken: (rawToken) => linkableTokens.has(rawToken),
      }),
    );
  }, [linkableTokens, mode, screenLines]);

  useEffect(() => {
    const requestId = activeResolveCandidatesRequestIdRef.current + 1;
    activeResolveCandidatesRequestIdRef.current = requestId;

    if (referenceCandidateTokens.length === 0) {
      setLinkableTokens((previous) => (previous.size === 0 ? previous : new Set()));
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
          if (next.size === previous.size && [...next].every((token) => previous.has(token))) {
            return previous;
          }
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
          if (next.size === previous.size && [...next].every((token) => previous.has(token))) {
            return previous;
          }
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

  return (
    <Card
      className={`relative flex min-w-0 flex-col gap-2 overflow-visible p-2 sm:gap-3 sm:p-4 ${
        isWorktreeSelectorOpen ? "z-[70]" : ""
      }`}
    >
      <Toolbar className="gap-2 sm:gap-3">
        <div className="flex items-center gap-2">{screenModeTabs(mode, onModeChange)}</div>
        <div className="flex items-center gap-2">
          <RawModeIndicator rawMode={rawMode} allowDangerKeys={allowDangerKeys} />
          <Button
            variant="ghost"
            size="sm"
            className="text-latte-subtext0 hover:text-latte-text h-[30px] w-[30px] p-0"
            onClick={onRefresh}
            aria-label="Refresh screen"
          >
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
        />
      </div>
      {contextLeftLabel ? (
        <span
          ref={contextLabelMeasureRef}
          aria-hidden="true"
          className="pointer-events-none fixed -left-[9999px] -top-[9999px] whitespace-nowrap px-1 text-[12px] font-medium tracking-[0.14em]"
        >
          {contextLeftLabel}
        </span>
      ) : null}
      <span
        ref={branchLabelMeasureRef}
        aria-hidden="true"
        className="pointer-events-none fixed -left-[9999px] -top-[9999px] whitespace-nowrap font-mono text-[10px] font-semibold tracking-[0.05em]"
      />
      {promptGitContext || contextLeftLabel ? (
        <div
          ref={promptGitContextRowRef}
          data-testid="prompt-git-context-row"
          className="-my-0.5 flex items-center justify-between gap-2"
        >
          <div ref={promptGitContextLeftRef} className="flex min-w-0 flex-1 items-center gap-1.5">
            {isVirtualActive ? (
              <IconButton
                type="button"
                size="xs"
                variant="dangerOutline"
                aria-label="Clear virtual worktree"
                title="Clear virtual worktree"
                className="shrink-0"
                onClick={() => {
                  onClearVirtualWorktree?.();
                  setIsWorktreeSelectorOpen(false);
                }}
              >
                <X className="h-3 w-3" />
              </IconButton>
            ) : null}
            <div ref={branchPillContainerRef} className={branchContainerClassName}>
              {worktreeSelectorEnabled ? (
                <button
                  type="button"
                  className={`border-latte-surface2/70 bg-latte-base/70 text-latte-text inline-flex min-w-0 max-w-full items-center gap-1 rounded-full border px-2 py-[3px] text-[10px] font-semibold tracking-[0.05em] ${branchTriggerWidthClassName}`}
                  title={gitBranchLabel}
                  aria-label="Select worktree"
                  onClick={() => {
                    setIsWorktreeSelectorOpen((previous) => !previous);
                  }}
                  data-testid="worktree-selector-trigger"
                >
                  <GitBranch className="text-latte-subtext0 h-3 w-3 shrink-0" />
                  <span ref={branchLabelSlotRef} className={branchLabelSlotClassName}>
                    <span className={LEADING_TRUNCATE_CLASS_NAME}>{displayGitBranchLabel}</span>
                  </span>
                  <ChevronsUpDown className="text-latte-subtext0 h-2.5 w-2.5 shrink-0" />
                </button>
              ) : (
                <TagPill
                  tone="neutral"
                  className={`text-latte-text inline-flex min-w-0 max-w-full items-center gap-1 px-2 py-[3px] text-[10px] font-semibold tracking-[0.05em] ${branchTriggerWidthClassName}`}
                  title={gitBranchLabel}
                >
                  <GitBranch className="text-latte-subtext0 h-3 w-3 shrink-0" />
                  <span ref={branchLabelSlotRef} className={branchLabelSlotClassName}>
                    <span className={LEADING_TRUNCATE_CLASS_NAME}>{displayGitBranchLabel}</span>
                  </span>
                </TagPill>
              )}
              {worktreeSelectorEnabled && isWorktreeSelectorOpen ? (
                <div
                  data-testid="worktree-selector-panel"
                  className="border-latte-surface2/80 bg-latte-base/95 shadow-popover absolute left-0 top-[calc(100%+0.35rem)] z-[80] w-[min(88vw,420px)] rounded-xl border p-2 pt-9"
                >
                  <div className="absolute right-1.5 top-1.5 flex items-center gap-1">
                    <IconButton
                      type="button"
                      size="xs"
                      variant="base"
                      aria-label="Reload worktrees"
                      title="Reload worktrees"
                      onClick={onRefreshWorktrees ?? onRefresh}
                    >
                      <RefreshCw className="h-3 w-3" />
                    </IconButton>
                    <IconButton
                      type="button"
                      size="xs"
                      variant="base"
                      aria-label="Close worktree selector"
                      title="Close worktree selector"
                      onClick={() => {
                        setIsWorktreeSelectorOpen(false);
                      }}
                    >
                      <X className="h-3 w-3" />
                    </IconButton>
                  </div>
                  <div className="pointer-events-none absolute inset-x-2 top-1.5 flex h-6 items-center gap-1.5 pr-14">
                    <GitBranch className="text-latte-subtext0 h-3 w-3 shrink-0" />
                    <span className="text-latte-subtext0 text-[10px] font-semibold uppercase leading-none tracking-[0.14em]">
                      Worktrees
                    </span>
                  </div>
                  <div>
                    {showBlockingWorktreeLoading ? (
                      <p className="text-latte-subtext0 px-1 py-2 text-xs">Loading worktrees...</p>
                    ) : null}
                    {worktreeSelectorError ? (
                      <p className="text-latte-red px-1 py-2 text-xs">{worktreeSelectorError}</p>
                    ) : null}
                    {!showBlockingWorktreeLoading &&
                    !worktreeSelectorError &&
                    worktreeEntries.length === 0 ? (
                      <p className="text-latte-subtext0 px-1 py-2 text-xs">
                        No worktrees available.
                      </p>
                    ) : null}
                    {!showBlockingWorktreeLoading && !worktreeSelectorError ? (
                      <div className="custom-scrollbar max-h-[280px] space-y-1 overflow-y-auto pr-0.5">
                        {displayedWorktreeEntries.map((entry) => {
                          const isVirtualSelected = entry.path === virtualWorktreePath;
                          const isActualPath = entry.path === actualWorktreePath;
                          const isRepoRootPath =
                            worktreeRepoRoot != null && entry.path === worktreeRepoRoot;
                          const isRepoRootDefaultBranch =
                            isRepoRootPath &&
                            worktreeBaseBranch != null &&
                            entry.branch != null &&
                            entry.branch === worktreeBaseBranch;
                          const shouldShowMergedFlag = !isRepoRootDefaultBranch;
                          const relativePath = formatRelativeWorktreePath(
                            entry.path,
                            worktreeRepoRoot,
                          );
                          const shouldShowRelativePath = relativePath !== ".";
                          const entryVisibleFileChangeCategories = buildVisibleFileChangeCategories(
                            entry.fileChanges,
                          );
                          const entryAdditionsLabel = formatGitMetric(entry.additions ?? null);
                          const entryDeletionsLabel = formatGitMetric(entry.deletions ?? null);
                          const hasAhead = hasWorktreeUpstreamDelta(entry.ahead);
                          const hasBehind = hasWorktreeUpstreamDelta(entry.behind);
                          const shouldShowAheadBehind = !isRepoRootPath && (hasAhead || hasBehind);
                          const entryBranchLabel = formatBranchLabel(entry.branch);
                          const prStatus = resolveWorktreePrStatus(entry.prStatus ?? null);
                          return (
                            <button
                              key={entry.path}
                              type="button"
                              className={`hover:bg-latte-lavender/12 border-latte-surface2/70 flex w-full items-start justify-between gap-2 rounded-lg border px-2 py-1.5 text-left text-xs ${
                                isVirtualSelected
                                  ? "bg-latte-lavender/15 border-latte-lavender/50"
                                  : ""
                              }`}
                              onClick={() => {
                                if (!onSelectVirtualWorktree) {
                                  return;
                                }
                                onSelectVirtualWorktree(entry.path);
                                setIsWorktreeSelectorOpen(false);
                              }}
                              disabled={!onSelectVirtualWorktree}
                            >
                              <span className="min-w-0 flex-1">
                                <span className="flex min-w-0 flex-1 items-center gap-1.5">
                                  <span className="text-latte-text min-w-0 flex-1 font-mono">
                                    <TruncatedSegmentText
                                      text={entryBranchLabel}
                                      reservePx={8}
                                      minVisibleSegments={2}
                                      className="min-w-0 flex-1 text-left"
                                    />
                                  </span>
                                  {isRepoRootPath ? (
                                    <TagPill
                                      tone="meta"
                                      className="border-latte-blue/45 bg-latte-blue/10 text-latte-blue shrink-0 whitespace-nowrap px-1.5 py-[2px] text-[9px] font-semibold uppercase tracking-[0.08em]"
                                    >
                                      Repo Root
                                    </TagPill>
                                  ) : null}
                                  <span className="flex shrink-0 items-center gap-1">
                                    {entryVisibleFileChangeCategories.map((item) => (
                                      <TagPill
                                        key={`${entry.path}:${item.key}`}
                                        tone="meta"
                                        className={`${item.className} px-1.5 py-[2px] text-[9px] font-semibold uppercase tracking-[0.08em]`}
                                      >
                                        {item.label} {item.value}
                                      </TagPill>
                                    ))}
                                    <span className="text-latte-green text-[10px] font-semibold">
                                      +{entryAdditionsLabel}
                                    </span>
                                    <span className="text-latte-red text-[10px] font-semibold">
                                      -{entryDeletionsLabel}
                                    </span>
                                  </span>
                                </span>
                                {shouldShowRelativePath ? (
                                  <span
                                    className="text-latte-subtext0 block truncate font-mono"
                                    title={entry.path}
                                  >
                                    {relativePath}
                                  </span>
                                ) : null}
                                {shouldShowAheadBehind ? (
                                  <span className="mt-1 flex flex-wrap items-center gap-1">
                                    {hasAhead ? (
                                      <span className="border-latte-green/45 bg-latte-green/10 text-latte-green inline-flex items-center rounded-full border px-1.5 py-0.5 font-mono text-[9px]">
                                        Ahead {entry.ahead}
                                      </span>
                                    ) : null}
                                    {hasBehind ? (
                                      <span className="border-latte-yellow/45 bg-latte-yellow/12 text-latte-yellow inline-flex items-center rounded-full border px-1.5 py-0.5 font-mono text-[9px]">
                                        Behind {entry.behind}
                                      </span>
                                    ) : null}
                                  </span>
                                ) : null}
                                <span className="mt-1 flex flex-wrap items-center gap-1">
                                  <span
                                    className={`inline-flex items-center rounded-full border px-1.5 py-0.5 font-mono text-[9px] ${resolveWorktreeFlagClassName("dirty", entry.dirty)}`}
                                  >
                                    Dirty {formatWorktreeFlag(entry.dirty)}
                                  </span>
                                  {!isRepoRootPath ? (
                                    <span
                                      className={`inline-flex items-center rounded-full border px-1.5 py-0.5 font-mono text-[9px] ${resolveWorktreeFlagClassName("locked", entry.locked)}`}
                                    >
                                      Locked {formatWorktreeFlag(entry.locked)}
                                    </span>
                                  ) : null}
                                  {!isRepoRootPath ? (
                                    <span
                                      className={`inline-flex items-center rounded-full border px-1.5 py-0.5 font-mono text-[9px] ${prStatus.className}`}
                                    >
                                      {prStatus.label}
                                    </span>
                                  ) : null}
                                  {shouldShowMergedFlag ? (
                                    <span
                                      className={`inline-flex items-center rounded-full border px-1.5 py-0.5 font-mono text-[9px] ${resolveWorktreeFlagClassName("merged", entry.merged)}`}
                                    >
                                      Merged {formatWorktreeFlag(entry.merged)}
                                    </span>
                                  ) : null}
                                  {isActualPath ? (
                                    <span className="border-latte-lavender/45 bg-latte-lavender/10 text-latte-lavender inline-flex items-center rounded-full border px-1.5 py-0.5 font-mono text-[9px]">
                                      Current
                                    </span>
                                  ) : null}
                                </span>
                              </span>
                              {isVirtualSelected ? (
                                <Check className="text-latte-lavender mt-0.5 h-3.5 w-3.5 shrink-0" />
                              ) : null}
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
            {isVirtualActive ? (
              <TagPill
                tone="meta"
                aria-label="Virtual worktree active"
                title="Virtual worktree active"
                className="border-latte-lavender/50 bg-latte-lavender/10 text-latte-lavender inline-flex shrink-0 items-center justify-center px-2 py-[3px] text-[10px] font-semibold tracking-[0.08em]"
              >
                Virt
              </TagPill>
            ) : null}
            {visibleFileChangeCategories.map((item) => (
              <TagPill
                key={item.key}
                tone="meta"
                className={`${item.className} shrink-0 px-2 py-[3px] text-[10px] font-semibold uppercase tracking-[0.08em]`}
              >
                {item.label} {item.value}
              </TagPill>
            ))}
            <span className="text-latte-green shrink-0 text-[11px] font-semibold">
              +{gitAdditionsLabel}
            </span>
            <span className="text-latte-red shrink-0 text-[11px] font-semibold">
              -{gitDeletionsLabel}
            </span>
          </div>
          {contextLeftLabel && !isContextInStatusRow ? (
            <span className="text-latte-subtext0 shrink-0 px-1 text-[12px] font-medium tracking-[0.14em]">
              {contextLeftLabel}
            </span>
          ) : null}
        </div>
      ) : null}
      {pollingPauseMeta || (contextLeftLabel && isContextInStatusRow) ? (
        <div data-testid="prompt-status-row" className="-mt-0.5 flex items-center gap-2">
          {pollingPauseMeta ? (
            <span
              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] ${pollingPauseMeta.className}`}
            >
              {pollingPauseMeta.label}
            </span>
          ) : null}
          {contextLeftLabel && isContextInStatusRow ? (
            <span className="text-latte-subtext0 ml-auto shrink-0 px-1 text-right text-[12px] font-medium tracking-[0.14em]">
              {contextLeftLabel}
            </span>
          ) : null}
        </div>
      ) : null}
      <div>{controls}</div>
    </Card>
  );
};
