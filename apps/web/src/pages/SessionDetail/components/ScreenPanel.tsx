import type { WorktreeListEntry } from "@vde-monitor/shared";
import { ChevronsUpDown, FileText, GitBranch, Image, RefreshCw, X } from "lucide-react";
import {
  type ClipboardEvent,
  forwardRef,
  type HTMLAttributes,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type RefObject,
  useCallback,
  useMemo,
} from "react";
import type { VirtuosoHandle } from "react-virtuoso";

import {
  Button,
  Callout,
  Card,
  IconButton,
  Tabs,
  TabsList,
  TabsTrigger,
  TagPill,
  Toolbar,
} from "@/components/ui";
import { sanitizeLogCopyText } from "@/lib/clipboard";
import type { ScreenMode } from "@/lib/screen-loading";

import { usePromptContextLayout } from "../hooks/usePromptContextLayout";
import { useScreenPanelLogReferenceLinking } from "../hooks/useScreenPanelLogReferenceLinking";
import { useScreenPanelWorktreeSelector } from "../hooks/useScreenPanelWorktreeSelector";
import { useStableVirtuosoScroll } from "../hooks/useStableVirtuosoScroll";
import { DISCONNECTED_MESSAGE, formatBranchLabel } from "../sessionDetailUtils";
import { ScreenPanelViewport } from "./ScreenPanelViewport";
import { ScreenPanelWorktreeSelectorPanel } from "./ScreenPanelWorktreeSelectorPanel";
import { buildVisibleFileChangeCategories, formatGitMetric } from "./worktree-view-model";

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

const LEADING_TRUNCATE_CLASS_NAME =
  "block w-full min-w-0 overflow-hidden whitespace-nowrap text-left font-mono";

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
  const visibleFileChangeCategoriesKey = useMemo(
    () => visibleFileChangeCategories.map((item) => `${item.key}:${item.value}`).join("|"),
    [visibleFileChangeCategories],
  );
  const {
    isContextInStatusRow,
    displayGitBranchLabel,
    promptGitContextRowRef,
    promptGitContextLeftRef,
    contextLabelMeasureRef,
    branchPillContainerRef,
    branchLabelMeasureRef,
    branchLabelSlotClassName,
    branchTriggerWidthClassName,
    branchContainerClassName,
  } = usePromptContextLayout({
    gitBranchLabel,
    contextLeftLabel,
    worktreeSelectorEnabled,
    gitAdditionsLabel,
    gitDeletionsLabel,
    isVirtualActive,
    visibleFileChangeCategoriesKey,
  });
  const {
    isOpen: isWorktreeSelectorOpen,
    toggle: toggleWorktreeSelector,
    close: closeWorktreeSelector,
  } = useScreenPanelWorktreeSelector({
    enabled: worktreeSelectorEnabled,
    onRefreshScreen: onRefresh,
    onRefreshWorktrees,
    containerRef: branchPillContainerRef,
  });

  const { scrollerRef: stableScrollerRef, handleRangeChanged } = useStableVirtuosoScroll({
    items: screenLines,
    isAtBottom,
    enabled: mode === "text",
    scrollerRef,
    isUserScrolling: forceFollow,
    onUserScrollStateChange,
  });
  const { linkifiedScreenLines, handleScreenRangeChanged } = useScreenPanelLogReferenceLinking({
    mode,
    screenLines,
    onResolveFileReferenceCandidates,
    onRangeChanged: handleRangeChanged,
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
        <ScreenPanelViewport
          mode={mode}
          imageBase64={imageBase64}
          isAtBottom={isAtBottom}
          isScreenLoading={isScreenLoading}
          screenLines={linkifiedScreenLines}
          virtuosoRef={virtuosoRef}
          onAtBottomChange={onAtBottomChange}
          onRangeChanged={handleScreenRangeChanged}
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
                  closeWorktreeSelector();
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
                  onClick={toggleWorktreeSelector}
                  data-testid="worktree-selector-trigger"
                >
                  <GitBranch className="text-latte-subtext0 h-3 w-3 shrink-0" />
                  <span className={branchLabelSlotClassName}>
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
                  <span className={branchLabelSlotClassName}>
                    <span className={LEADING_TRUNCATE_CLASS_NAME}>{displayGitBranchLabel}</span>
                  </span>
                </TagPill>
              )}
              {worktreeSelectorEnabled && isWorktreeSelectorOpen ? (
                <ScreenPanelWorktreeSelectorPanel
                  entries={displayedWorktreeEntries}
                  worktreeRepoRoot={worktreeRepoRoot}
                  worktreeBaseBranch={worktreeBaseBranch}
                  virtualWorktreePath={virtualWorktreePath}
                  actualWorktreePath={actualWorktreePath}
                  worktreeSelectorLoading={worktreeSelectorLoading}
                  worktreeSelectorError={worktreeSelectorError}
                  onRefresh={onRefreshWorktrees ?? onRefresh}
                  onClose={() => {
                    closeWorktreeSelector();
                  }}
                  onSelectVirtualWorktree={onSelectVirtualWorktree}
                />
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
