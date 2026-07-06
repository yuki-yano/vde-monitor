import { MonitorX, RefreshCw, Search } from "lucide-react";
import { type CSSProperties, useCallback, useEffect, useRef } from "react";

import { ThemeToggle } from "@/components/theme-toggle";
import { Button, EmptyCard, GlassPanel, GlowCard } from "@/components/ui";
import { LogModal } from "@/features/shared-session-ui/components/LogModal";
import { QuickPanel } from "@/features/shared-session-ui/components/QuickPanel";
import { SessionSidebar } from "@/features/shared-session-ui/components/SessionSidebar";
import { cn } from "@/lib/cn";
import { useLazyRef } from "@/lib/use-lazy-ref";

import { SessionGroupSection } from "./components/SessionGroupSection";
import { SessionListHeader } from "./components/SessionListHeader";
import { createRepoPinKey } from "./sessionListPins";
import type { SessionListVM } from "./useSessionListVM";

export type SessionListViewProps = SessionListVM;

type ReorderScrollTarget = { scope: "repo"; key: string } | { scope: "pane"; key: string };

type LoadingBarProps = {
  className: string;
  shimmerClassName: string;
};

const LoadingBar = ({ className, shimmerClassName }: LoadingBarProps) => (
  <div
    className={cn(
      "animate-skeleton-pulse bg-latte-surface0/65 relative overflow-hidden rounded-full",
      className,
    )}
  >
    <div
      className={cn(
        "animate-skeleton-shimmer bg-latte-surface2/75 absolute inset-y-0 left-0 rounded-full",
        shimmerClassName,
      )}
    />
  </div>
);

const SessionListLoadingSkeleton = () => (
  <div
    data-testid="session-list-loading-skeleton"
    role="status"
    aria-live="polite"
    className="flex flex-col gap-4 sm:gap-6"
  >
    <p className="text-latte-subtext0 text-sm">Loading Sessions...</p>
    {[0, 1].map((cardIndex) => (
      <GlowCard key={`session-list-loading-${cardIndex}`} contentClassName="gap-1.5 sm:gap-3">
        <GlassPanel
          className="px-2.5 py-2 sm:px-4 sm:py-4"
          contentClassName="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex min-w-0 items-start gap-3">
            <div className="border-latte-surface2/70 from-latte-crust/70 via-latte-surface0/70 to-latte-mantle/80 relative flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border bg-linear-to-br">
              <div className="animate-skeleton-shimmer bg-latte-lavender/40 absolute inset-y-0 left-0 w-5 rounded-2xl" />
            </div>
            <div className="min-w-0 space-y-1">
              <LoadingBar className="h-5 w-40" shimmerClassName="w-14" />
              <LoadingBar className="h-3 w-56 max-w-[60vw]" shimmerClassName="w-16" />
            </div>
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:min-w-[320px]">
            <LoadingBar className="h-5 w-20" shimmerClassName="w-8" />
            <LoadingBar className="h-5 w-16" shimmerClassName="w-7" />
            <div className="ml-auto flex items-center gap-2">
              <LoadingBar className="h-7 w-7 rounded-xl" shimmerClassName="w-4 rounded-xl" />
              <LoadingBar className="h-7 w-7 rounded-xl" shimmerClassName="w-4 rounded-xl" />
              <LoadingBar className="h-5 w-20" shimmerClassName="w-10" />
            </div>
          </div>
        </GlassPanel>

        <div className="pt-1.5 sm:pt-3">
          <div className="space-y-2.5 sm:space-y-4">
            {[0, 1].map((rowIndex) => (
              <GlassPanel
                key={`session-list-loading-${cardIndex}-${rowIndex}`}
                className="px-2.5 py-2 sm:px-3 sm:py-3"
                contentClassName="space-y-2"
              >
                <div className="flex items-center gap-2">
                  <LoadingBar className="h-4 w-28" shimmerClassName="w-10" />
                  <LoadingBar className="ml-auto h-6 w-20" shimmerClassName="w-9" />
                </div>
                <LoadingBar className="h-8 w-full rounded-xl" shimmerClassName="w-20 rounded-xl" />
                <LoadingBar className="h-8 w-11/12 rounded-xl" shimmerClassName="w-16 rounded-xl" />
              </GlassPanel>
            ))}
          </div>
        </div>
      </GlowCard>
    ))}
  </div>
);

type SessionListSidebarPanelProps = Pick<
  SessionListViewProps,
  | "sidebarSessionGroups"
  | "sidebarWidth"
  | "nowMs"
  | "connected"
  | "connectionIssue"
  | "launchConfig"
  | "requestWorktrees"
  | "requestStateTimeline"
  | "requestScreen"
  | "highlightCorrections"
  | "resolvedTheme"
  | "onSidebarResizeStart"
  | "onOpenPaneHere"
  | "onLaunchAgentInSession"
> & {
  onTouchRepoPin: (repoRoot: string | null) => void;
  onTouchPanePin: (paneId: string) => void;
};

const SessionListSidebarPanel = ({
  sidebarSessionGroups,
  sidebarWidth,
  nowMs,
  connected,
  connectionIssue,
  launchConfig,
  requestWorktrees,
  requestStateTimeline,
  requestScreen,
  highlightCorrections,
  resolvedTheme,
  onSidebarResizeStart,
  onOpenPaneHere,
  onLaunchAgentInSession,
  onTouchRepoPin,
  onTouchPanePin,
}: SessionListSidebarPanelProps) => (
  <div
    className="fixed left-0 top-0 z-40 hidden h-screen md:flex"
    style={{ width: `${sidebarWidth}px` }}
  >
    <SessionSidebar
      state={{
        sessionGroups: sidebarSessionGroups,
        sidebarWidth,
        nowMs,
        connected,
        connectionIssue,
        launchConfig,
        requestWorktrees,
        requestStateTimeline,
        requestScreen,
        highlightCorrections,
        resolvedTheme,
        currentPaneId: null,
        className: "border-latte-surface1/80 h-full w-full rounded-none rounded-r-3xl border-r",
      }}
      actions={{
        onSelectSession: onOpenPaneHere,
        onFocusPane: onOpenPaneHere,
        onLaunchAgentInSession,
        onTouchSession: onTouchPanePin,
        onTouchRepoPin,
      }}
    />
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize sidebar"
      className="absolute right-0 top-0 h-full w-2 cursor-col-resize touch-none"
      onPointerDown={onSidebarResizeStart}
    />
  </div>
);

type SessionListGroupsProps = Pick<
  SessionListViewProps,
  | "groups"
  | "sessions"
  | "nowMs"
  | "launchPendingSessions"
  | "launchConfig"
  | "requestWorktrees"
  | "onLaunchAgentInSession"
> & {
  onTouchRepoPin: (repoRoot: string | null) => void;
  onTouchPanePin: (paneId: string) => void;
  onRegisterRepoScrollTarget: (key: string, element: HTMLElement | null) => void;
  onRegisterPaneScrollTarget: (paneId: string, element: HTMLAnchorElement | null) => void;
};

const SessionListGroups = ({
  groups,
  sessions,
  nowMs,
  launchPendingSessions,
  launchConfig,
  requestWorktrees,
  onLaunchAgentInSession,
  onTouchRepoPin,
  onTouchPanePin,
  onRegisterRepoScrollTarget,
  onRegisterPaneScrollTarget,
}: SessionListGroupsProps) => (
  <>
    {groups.map((group) => {
      const repoScrollKey = createRepoPinKey(group.repoRoot);
      return (
        <div
          key={group.repoRoot ?? "no-repo"}
          data-repo-scroll-key={repoScrollKey}
          ref={(element) => onRegisterRepoScrollTarget(repoScrollKey, element)}
        >
          <SessionGroupSection
            group={group}
            allSessions={sessions}
            nowMs={nowMs}
            launchPendingSessions={launchPendingSessions}
            launchConfig={launchConfig}
            requestWorktrees={requestWorktrees}
            onLaunchAgentInSession={onLaunchAgentInSession}
            onTouchRepoPin={onTouchRepoPin}
            onTouchPanePin={onTouchPanePin}
            onRegisterPaneScrollTarget={onRegisterPaneScrollTarget}
          />
        </div>
      );
    })}
  </>
);

type SessionListMainContentProps = Pick<
  SessionListViewProps,
  | "sessions"
  | "groups"
  | "visibleSessionCount"
  | "filter"
  | "searchQuery"
  | "filterOptions"
  | "connectionStatus"
  | "connectionIssue"
  | "transport"
  | "screenError"
  | "sidebarWidth"
  | "nowMs"
  | "launchPendingSessions"
  | "launchConfig"
  | "requestWorktrees"
  | "onFilterChange"
  | "onSearchQueryChange"
  | "onRefresh"
  | "onOpenChatGrid"
  | "onOpenUsage"
  | "onLaunchAgentInSession"
> & {
  isDiscoveringSessions: boolean;
  onTouchRepoPin: (repoRoot: string | null) => void;
  onTouchPanePin: (paneId: string) => void;
  onRegisterRepoScrollTarget: (key: string, element: HTMLElement | null) => void;
  onRegisterPaneScrollTarget: (paneId: string, element: HTMLAnchorElement | null) => void;
};

const SessionListMainContent = ({
  sessions,
  groups,
  visibleSessionCount,
  filter,
  searchQuery,
  filterOptions,
  connectionStatus,
  connectionIssue,
  transport,
  screenError,
  sidebarWidth,
  nowMs,
  launchPendingSessions,
  launchConfig,
  requestWorktrees,
  isDiscoveringSessions,
  onFilterChange,
  onSearchQueryChange,
  onRefresh,
  onOpenChatGrid,
  onOpenUsage,
  onLaunchAgentInSession,
  onTouchRepoPin,
  onTouchPanePin,
  onRegisterRepoScrollTarget,
  onRegisterPaneScrollTarget,
}: SessionListMainContentProps) => (
  <div
    className="animate-fade-in-up w-full px-2.5 pb-7 pt-3.5 sm:px-4 sm:pb-10 sm:pt-6 md:pl-[calc(var(--sidebar-width)+32px)] md:pr-6"
    style={{ "--sidebar-width": `${sidebarWidth}px` } as CSSProperties}
  >
    <div className="flex flex-col gap-4 sm:gap-6">
      <div className="flex items-center justify-between gap-3">
        <div />
        <ThemeToggle />
      </div>
      <SessionListHeader
        connectionStatus={connectionStatus}
        connectionIssue={connectionIssue}
        transport={transport}
        filter={filter}
        searchQuery={searchQuery}
        filterOptions={filterOptions}
        onFilterChange={onFilterChange}
        onSearchQueryChange={onSearchQueryChange}
        onRefresh={onRefresh}
        onOpenChatGrid={onOpenChatGrid}
        onOpenUsage={onOpenUsage}
      />
      {screenError ? (
        <div
          role="alert"
          className="border-latte-red/30 bg-latte-red/10 text-latte-red rounded-xl border px-3 py-2 text-sm"
        >
          {screenError}
        </div>
      ) : null}

      <div className="flex flex-col gap-4 sm:gap-6">
        <div className="flex min-w-0 flex-1 flex-col gap-4 sm:gap-6">
          {isDiscoveringSessions && <SessionListLoadingSkeleton />}
          {sessions.length === 0 && !isDiscoveringSessions && (
            <EmptyCard
              icon={<MonitorX className="text-latte-overlay1 h-10 w-10" />}
              title="No Active Sessions"
              description="Start a tmux session with Codex or Claude Code to see it here. Sessions will appear automatically when detected."
              className="py-12 sm:py-16"
              iconWrapperClassName="bg-latte-surface1/50 h-20 w-20"
              titleClassName="text-xl"
              descriptionClassName="max-w-sm"
              action={
                <Button variant="ghost" size="sm" onClick={onRefresh} className="mt-2">
                  <RefreshCw className="h-4 w-4" />
                  Check Again
                </Button>
              }
            />
          )}
          {sessions.length > 0 && visibleSessionCount === 0 && (
            <EmptyCard
              icon={<Search className="text-latte-overlay1 h-8 w-8" />}
              title="No Matching Sessions"
              description={
                searchQuery.length > 0
                  ? "No sessions match the current search query. Try a different query."
                  : "No sessions match the selected scope. Try selecting a different scope."
              }
              className="py-10 sm:py-12"
              iconWrapperClassName="bg-latte-surface1/50 h-16 w-16"
              titleClassName="text-lg"
              action={
                searchQuery.length > 0 ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onSearchQueryChange("")}
                    className="mt-2"
                  >
                    Clear Search
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onFilterChange("ALL")}
                    className="mt-2"
                  >
                    Show All Sessions
                  </Button>
                )
              }
            />
          )}
          <SessionListGroups
            groups={groups}
            sessions={sessions}
            nowMs={nowMs}
            launchPendingSessions={launchPendingSessions}
            launchConfig={launchConfig}
            requestWorktrees={requestWorktrees}
            onLaunchAgentInSession={onLaunchAgentInSession}
            onTouchRepoPin={onTouchRepoPin}
            onTouchPanePin={onTouchPanePin}
            onRegisterRepoScrollTarget={onRegisterRepoScrollTarget}
            onRegisterPaneScrollTarget={onRegisterPaneScrollTarget}
          />
        </div>
      </div>
    </div>
  </div>
);

type SessionListOverlayProps = Pick<
  SessionListViewProps,
  | "quickPanelOpen"
  | "quickPanelGroups"
  | "sessions"
  | "nowMs"
  | "logModalOpen"
  | "selectedSession"
  | "selectedLogLines"
  | "selectedLogLoading"
  | "selectedLogError"
  | "onOpenLogModal"
  | "onCloseLogModal"
  | "onToggleQuickPanel"
  | "onCloseQuickPanel"
  | "onOpenPaneHere"
  | "onOpenPaneInNewWindow"
  | "onOpenHere"
  | "onOpenNewTab"
>;

const SessionListOverlay = ({
  quickPanelOpen,
  quickPanelGroups,
  sessions,
  nowMs,
  logModalOpen,
  selectedSession,
  selectedLogLines,
  selectedLogLoading,
  selectedLogError,
  onOpenLogModal,
  onCloseLogModal,
  onToggleQuickPanel,
  onCloseQuickPanel,
  onOpenPaneHere,
  onOpenPaneInNewWindow,
  onOpenHere,
  onOpenNewTab,
}: SessionListOverlayProps) => (
  <>
    <div className="md:hidden">
      <QuickPanel
        state={{
          open: quickPanelOpen,
          sessionGroups: quickPanelGroups,
          allSessions: sessions,
          nowMs,
          currentPaneId: null,
        }}
        actions={{
          onOpenLogModal,
          onOpenSessionLink: onOpenPaneHere,
          onOpenSessionLinkInNewWindow: onOpenPaneInNewWindow,
          onClose: onCloseQuickPanel,
          onToggle: onToggleQuickPanel,
        }}
      />
    </div>

    <LogModal
      state={{
        open: logModalOpen,
        session: selectedSession,
        logLines: selectedLogLines,
        loading: selectedLogLoading,
        error: selectedLogError,
      }}
      actions={{
        onClose: onCloseLogModal,
        onOpenHere,
        onOpenNewTab,
      }}
    />
  </>
);

export const SessionListView = ({
  sessions,
  groups,
  sidebarSessionGroups,
  visibleSessionCount,
  quickPanelGroups,
  filter,
  searchQuery,
  filterOptions,
  connected,
  connectionStatus,
  connectionIssue,
  transport,
  requestStateTimeline,
  requestScreen,
  requestWorktrees,
  highlightCorrections,
  launchConfig,
  resolvedTheme,
  nowMs,
  sidebarWidth,
  onFilterChange,
  onSearchQueryChange,
  onRefresh,
  onOpenChatGrid,
  onOpenUsage,
  onSidebarResizeStart,
  quickPanelOpen,
  logModalOpen,
  selectedSession,
  selectedLogLines,
  selectedLogLoading,
  selectedLogError,
  onOpenLogModal,
  onCloseLogModal,
  onToggleQuickPanel,
  onCloseQuickPanel,
  onOpenPaneHere,
  onOpenPaneInNewWindow,
  onOpenHere,
  onOpenNewTab,
  screenError,
  launchPendingSessions,
  onLaunchAgentInSession,
  onTouchRepoPin,
  onTouchPanePin,
}: SessionListViewProps) => {
  const repoScrollTargetsRef = useLazyRef(() => new Map<string, HTMLElement>());
  const paneScrollTargetsRef = useLazyRef(() => new Map<string, HTMLAnchorElement>());
  const reorderScrollFrameRef = useRef<number | null>(null);
  const isDiscoveringSessions =
    sessions.length === 0 && connectionStatus === "degraded" && connectionIssue == null;

  const registerRepoScrollTarget = useCallback(
    (key: string, element: HTMLElement | null) => {
      const targetMap = repoScrollTargetsRef.current;
      if (!element) {
        targetMap.delete(key);
        return;
      }
      targetMap.set(key, element);
    },
    [repoScrollTargetsRef],
  );

  const registerPaneScrollTarget = useCallback(
    (paneId: string, element: HTMLAnchorElement | null) => {
      const targetMap = paneScrollTargetsRef.current;
      if (!element) {
        targetMap.delete(paneId);
        return;
      }
      targetMap.set(paneId, element);
    },
    [paneScrollTargetsRef],
  );

  const startReorderScroll = useCallback(
    (reorderScrollTarget: ReorderScrollTarget) => {
      if (reorderScrollFrameRef.current != null) {
        window.cancelAnimationFrame(reorderScrollFrameRef.current);
        reorderScrollFrameRef.current = null;
      }

      let attempt = 0;
      const maxAttempts = reorderScrollTarget.scope === "repo" ? 8 : 24;

      const tryScroll = () => {
        const target =
          reorderScrollTarget.scope === "repo"
            ? repoScrollTargetsRef.current.get(reorderScrollTarget.key)
            : paneScrollTargetsRef.current.get(reorderScrollTarget.key);
        if (!target) {
          attempt += 1;
          if (attempt >= maxAttempts) {
            reorderScrollFrameRef.current = null;
            return;
          }
          reorderScrollFrameRef.current = window.requestAnimationFrame(tryScroll);
          return;
        }
        target.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
        reorderScrollFrameRef.current = null;
      };

      reorderScrollFrameRef.current = window.requestAnimationFrame(tryScroll);
    },
    [paneScrollTargetsRef, reorderScrollFrameRef, repoScrollTargetsRef],
  );

  const handleTouchRepoPinWithScroll = useCallback(
    (repoRoot: string | null) => {
      onTouchRepoPin(repoRoot);
      startReorderScroll({
        scope: "repo",
        key: createRepoPinKey(repoRoot),
      });
    },
    [onTouchRepoPin, startReorderScroll],
  );

  const handleTouchPanePinWithScroll = useCallback(
    (paneId: string) => {
      onTouchPanePin(paneId);
      startReorderScroll({
        scope: "pane",
        key: paneId,
      });
    },
    [onTouchPanePin, startReorderScroll],
  );

  useEffect(() => {
    return () => {
      if (reorderScrollFrameRef.current != null) {
        window.cancelAnimationFrame(reorderScrollFrameRef.current);
        reorderScrollFrameRef.current = null;
      }
    };
  }, [reorderScrollFrameRef]);

  return (
    <>
      <SessionListSidebarPanel
        sidebarSessionGroups={sidebarSessionGroups}
        sidebarWidth={sidebarWidth}
        nowMs={nowMs}
        connected={connected}
        connectionIssue={connectionIssue}
        launchConfig={launchConfig}
        requestWorktrees={requestWorktrees}
        requestStateTimeline={requestStateTimeline}
        requestScreen={requestScreen}
        highlightCorrections={highlightCorrections}
        resolvedTheme={resolvedTheme}
        onSidebarResizeStart={onSidebarResizeStart}
        onOpenPaneHere={onOpenPaneHere}
        onLaunchAgentInSession={onLaunchAgentInSession}
        onTouchRepoPin={handleTouchRepoPinWithScroll}
        onTouchPanePin={handleTouchPanePinWithScroll}
      />

      <SessionListMainContent
        sessions={sessions}
        groups={groups}
        visibleSessionCount={visibleSessionCount}
        filter={filter}
        searchQuery={searchQuery}
        filterOptions={filterOptions}
        connectionStatus={connectionStatus}
        connectionIssue={connectionIssue}
        transport={transport}
        screenError={screenError}
        sidebarWidth={sidebarWidth}
        nowMs={nowMs}
        launchPendingSessions={launchPendingSessions}
        launchConfig={launchConfig}
        requestWorktrees={requestWorktrees}
        isDiscoveringSessions={isDiscoveringSessions}
        onFilterChange={onFilterChange}
        onSearchQueryChange={onSearchQueryChange}
        onRefresh={onRefresh}
        onOpenChatGrid={onOpenChatGrid}
        onOpenUsage={onOpenUsage}
        onLaunchAgentInSession={onLaunchAgentInSession}
        onTouchRepoPin={handleTouchRepoPinWithScroll}
        onTouchPanePin={handleTouchPanePinWithScroll}
        onRegisterRepoScrollTarget={registerRepoScrollTarget}
        onRegisterPaneScrollTarget={registerPaneScrollTarget}
      />

      <SessionListOverlay
        quickPanelOpen={quickPanelOpen}
        quickPanelGroups={quickPanelGroups}
        sessions={sessions}
        nowMs={nowMs}
        logModalOpen={logModalOpen}
        selectedSession={selectedSession}
        selectedLogLines={selectedLogLines}
        selectedLogLoading={selectedLogLoading}
        selectedLogError={selectedLogError}
        onOpenLogModal={onOpenLogModal}
        onCloseLogModal={onCloseLogModal}
        onToggleQuickPanel={onToggleQuickPanel}
        onCloseQuickPanel={onCloseQuickPanel}
        onOpenPaneHere={onOpenPaneHere}
        onOpenPaneInNewWindow={onOpenPaneInNewWindow}
        onOpenHere={onOpenHere}
        onOpenNewTab={onOpenNewTab}
      />
    </>
  );
};
