import type { WorktreeListEntry } from "@vde-monitor/shared";
import { Bell, BellOff, FileText, Image, RefreshCw, TextWrap } from "lucide-react";
import {
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

import { Button, Callout, Card, Tabs, TabsList, TabsTrigger, Toolbar } from "@/components/ui";
import type { PushUiStatus } from "@/features/notifications/use-push-notifications";
import { cn } from "@/lib/cn";
import type { ScreenMode } from "@/lib/screen-loading";

import type { ScreenWrapMode } from "../atoms/screenAtoms";
import { usePromptContextLayout } from "../hooks/usePromptContextLayout";
import { useScreenPanelLogReferenceLinking } from "../hooks/useScreenPanelLogReferenceLinking";
import { useScreenPanelWorktreeSelector } from "../hooks/useScreenPanelWorktreeSelector";
import { useStableVirtuosoScroll } from "../hooks/useStableVirtuosoScroll";
import { DISCONNECTED_MESSAGE, formatBranchLabel } from "../sessionDetailUtils";
import { classifySmartWrapLines } from "../smart-wrap-classify";
import { ScreenPanelPromptContext } from "./screen-panel-prompt-context";
import { ScreenPanelViewport } from "./ScreenPanelViewport";
import {
  buildVisibleFileChangeCategories,
  formatGitMetric,
  sortWorktreeEntriesByRepoRoot,
} from "./worktree-view-model";

type ScreenPanelState = {
  mode: ScreenMode;
  wrapMode: ScreenWrapMode;
  paneId: string;
  sourceRepoRoot: string | null;
  agent: "codex" | "claude" | "unknown";
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
  notificationStatus: PushUiStatus;
  notificationPushEnabled: boolean;
  notificationSubscribed: boolean;
  notificationPaneEnabled: boolean;
};

type ScreenPanelActions = {
  onModeChange: (mode: ScreenMode) => void;
  onToggleWrapMode: () => void;
  onRefresh: () => void;
  onRefreshWorktrees?: () => void;
  onAtBottomChange: (value: boolean) => void;
  onScrollToBottom: (behavior: "auto" | "smooth") => void;
  onUserScrollStateChange: (value: boolean) => void;
  onSelectVirtualWorktree?: (path: string) => void;
  onClearVirtualWorktree?: () => void;
  onRequestNotificationPermission?: () => void;
  onTogglePaneNotification?: () => void;
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
    wrapMode,
    paneId,
    sourceRepoRoot,
    agent,
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
    notificationStatus,
    notificationPushEnabled,
    notificationSubscribed,
    notificationPaneEnabled,
  } = state;
  const {
    onModeChange,
    onToggleWrapMode,
    onRefresh,
    onRefreshWorktrees,
    onAtBottomChange,
    onScrollToBottom,
    onUserScrollStateChange,
    onSelectVirtualWorktree,
    onClearVirtualWorktree,
    onRequestNotificationPermission,
    onTogglePaneNotification,
    onResolveFileReference,
    onResolveFileReferenceCandidates,
  } = actions;
  const showError = shouldShowErrorMessage(error, connectionIssue);
  const effectiveWrapMode: ScreenWrapMode =
    mode === "text" && wrapMode === "smart" ? "smart" : "off";
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
  const displayedWorktreeEntries = useMemo(
    () => sortWorktreeEntriesByRepoRoot(worktreeEntries, worktreeRepoRoot),
    [worktreeEntries, worktreeRepoRoot],
  );
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
    enabled: mode === "text" && effectiveWrapMode === "off",
    scrollerRef,
    isUserScrolling: forceFollow,
    onUserScrollStateChange,
  });
  const smartLineClassifications = useMemo(
    () =>
      mode === "text" && effectiveWrapMode === "smart"
        ? classifySmartWrapLines(screenLines, agent)
        : [],
    [agent, effectiveWrapMode, mode, screenLines],
  );
  const showPaneNotificationToggle = notificationStatus !== "needs-ios-install";
  const paneNotificationClickHandler = notificationSubscribed
    ? onTogglePaneNotification
    : onRequestNotificationPermission;
  const paneNotificationAriaLabel = notificationSubscribed
    ? "Toggle session notification"
    : "Enable push notifications";
  const { linkifiedScreenLines, handleScreenRangeChanged } = useScreenPanelLogReferenceLinking({
    mode,
    effectiveWrapMode,
    paneId,
    sourceRepoRoot,
    agent,
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
          className={cn(
            "custom-scrollbar w-full min-w-0 max-w-full overflow-x-auto overflow-y-auto rounded-2xl",
            className,
          )}
        />
      ),
    );
    Component.displayName = "VirtuosoScroller";
    return Component;
  }, [stableScrollerRef]);

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
      className={cn(
        "relative flex min-w-0 flex-col gap-2 overflow-visible p-2 sm:gap-3 sm:p-4",
        isWorktreeSelectorOpen && "z-[70]",
      )}
    >
      <Toolbar className="gap-2 sm:gap-3">
        <div className="flex items-center gap-2">{screenModeTabs(mode, onModeChange)}</div>
        <div className="flex items-center gap-2">
          <RawModeIndicator rawMode={rawMode} allowDangerKeys={allowDangerKeys} />
          {showPaneNotificationToggle ? (
            <Button
              variant={notificationPaneEnabled ? "primary" : "ghost"}
              size="sm"
              className="h-[30px] w-[30px] p-0"
              onClick={paneNotificationClickHandler ?? undefined}
              disabled={
                !notificationPushEnabled ||
                !paneNotificationClickHandler ||
                notificationStatus === "denied"
              }
              aria-label={paneNotificationAriaLabel}
              aria-pressed={notificationSubscribed ? notificationPaneEnabled : undefined}
            >
              {notificationPaneEnabled ? (
                <Bell className="h-3.5 w-3.5" />
              ) : (
                <BellOff className="h-3.5 w-3.5" />
              )}
            </Button>
          ) : null}
          <Button
            variant={wrapMode === "smart" ? "primary" : "ghost"}
            size="sm"
            className="h-[30px] px-2 text-[10px] font-semibold uppercase tracking-[0.24em]"
            onClick={onToggleWrapMode}
            disabled={mode === "image"}
            aria-label="Toggle wrap mode"
            aria-pressed={wrapMode === "smart"}
          >
            <TextWrap className="h-3.5 w-3.5" />
          </Button>
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
      <ScreenPanelViewport
        mode={mode}
        effectiveWrapMode={effectiveWrapMode}
        imageBase64={imageBase64}
        isAtBottom={isAtBottom}
        isScreenLoading={isScreenLoading}
        screenLines={linkifiedScreenLines}
        smartLineClassifications={smartLineClassifications}
        virtuosoRef={virtuosoRef}
        scrollerRef={scrollerRef}
        onAtBottomChange={onAtBottomChange}
        onRangeChanged={handleScreenRangeChanged}
        VirtuosoScroller={VirtuosoScroller}
        onScrollToBottom={onScrollToBottom}
        onUserScrollStateChange={onUserScrollStateChange}
        onResolveFileReference={handleResolveFileReference}
        onResolveFileReferenceKeyDown={handleResolveFileReferenceKeyDown}
      />
      <ScreenPanelPromptContext
        promptGitContext={promptGitContext}
        contextLeftLabel={contextLeftLabel}
        isContextInStatusRow={isContextInStatusRow}
        displayGitBranchLabel={displayGitBranchLabel}
        gitBranchLabel={gitBranchLabel}
        isVirtualActive={isVirtualActive}
        visibleFileChangeCategories={visibleFileChangeCategories}
        gitAdditionsLabel={gitAdditionsLabel}
        gitDeletionsLabel={gitDeletionsLabel}
        worktreeSelectorEnabled={worktreeSelectorEnabled}
        worktreeSelectorLoading={worktreeSelectorLoading}
        worktreeSelectorError={worktreeSelectorError}
        displayedWorktreeEntries={displayedWorktreeEntries}
        worktreeRepoRoot={worktreeRepoRoot}
        worktreeBaseBranch={worktreeBaseBranch}
        actualWorktreePath={actualWorktreePath}
        virtualWorktreePath={virtualWorktreePath}
        isWorktreeSelectorOpen={isWorktreeSelectorOpen}
        branchLabelSlotClassName={branchLabelSlotClassName}
        branchTriggerWidthClassName={branchTriggerWidthClassName}
        branchContainerClassName={branchContainerClassName}
        promptGitContextRowRef={promptGitContextRowRef}
        promptGitContextLeftRef={promptGitContextLeftRef}
        contextLabelMeasureRef={contextLabelMeasureRef}
        branchPillContainerRef={branchPillContainerRef}
        branchLabelMeasureRef={branchLabelMeasureRef}
        pollingPauseMeta={pollingPauseMeta}
        onRefresh={onRefresh}
        onRefreshWorktrees={onRefreshWorktrees}
        onSelectVirtualWorktree={onSelectVirtualWorktree}
        onClearVirtualWorktree={onClearVirtualWorktree}
        onToggleWorktreeSelector={toggleWorktreeSelector}
        onCloseWorktreeSelector={closeWorktreeSelector}
      />
      <div>{controls}</div>
    </Card>
  );
};
