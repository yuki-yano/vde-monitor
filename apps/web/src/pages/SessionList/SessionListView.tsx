import { MonitorX, RefreshCw, Search } from "lucide-react";
import { type CSSProperties, useCallback, useEffect, useRef, useState } from "react";

import { ThemeToggle } from "@/components/theme-toggle";
import { Button, EmptyCard } from "@/components/ui";
import { LogModal } from "@/features/shared-session-ui/components/LogModal";
import { QuickPanel } from "@/features/shared-session-ui/components/QuickPanel";
import { SessionSidebar } from "@/features/shared-session-ui/components/SessionSidebar";

import { SessionGroupSection } from "./components/SessionGroupSection";
import { SessionListHeader } from "./components/SessionListHeader";
import { createRepoPinKey } from "./sessionListPins";
import type { SessionListVM } from "./useSessionListVM";

export type SessionListViewProps = SessionListVM;

type ReorderScrollTarget = { scope: "repo"; key: string } | { scope: "pane"; key: string };

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
  const [reorderScrollTarget, setReorderScrollTarget] = useState<ReorderScrollTarget | null>(null);
  const repoScrollTargetsRef = useRef(new Map<string, HTMLElement>());
  const paneScrollTargetsRef = useRef(new Map<string, HTMLAnchorElement>());
  const isDiscoveringSessions =
    sessions.length === 0 && connectionStatus === "degraded" && connectionIssue == null;

  const registerRepoScrollTarget = useCallback((key: string, element: HTMLElement | null) => {
    const targetMap = repoScrollTargetsRef.current;
    if (!element) {
      targetMap.delete(key);
      return;
    }
    targetMap.set(key, element);
  }, []);

  const registerPaneScrollTarget = useCallback(
    (paneId: string, element: HTMLAnchorElement | null) => {
      const targetMap = paneScrollTargetsRef.current;
      if (!element) {
        targetMap.delete(paneId);
        return;
      }
      targetMap.set(paneId, element);
    },
    [],
  );

  const handleTouchRepoPinWithScroll = useCallback(
    (repoRoot: string | null) => {
      onTouchRepoPin(repoRoot);
      setReorderScrollTarget({
        scope: "repo",
        key: createRepoPinKey(repoRoot),
      });
    },
    [onTouchRepoPin],
  );

  const handleTouchPanePinWithScroll = useCallback(
    (paneId: string) => {
      onTouchPanePin(paneId);
      setReorderScrollTarget({
        scope: "pane",
        key: paneId,
      });
    },
    [onTouchPanePin],
  );

  useEffect(() => {
    if (reorderScrollTarget == null) {
      return;
    }

    let frameId: number | null = null;
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
          setReorderScrollTarget(null);
          return;
        }
        frameId = window.requestAnimationFrame(tryScroll);
        return;
      }
      target.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
      setReorderScrollTarget(null);
    };

    frameId = window.requestAnimationFrame(tryScroll);

    return () => {
      if (frameId != null) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, [reorderScrollTarget]);

  return (
    <>
      <div
        className="fixed left-0 top-0 z-40 hidden h-screen md:flex"
        style={{ width: `${sidebarWidth}px` }}
      >
        <SessionSidebar
          state={{
            sessionGroups: sidebarSessionGroups,
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
            onTouchSession: handleTouchPanePinWithScroll,
            onTouchRepoPin: handleTouchRepoPinWithScroll,
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
            filter={filter}
            searchQuery={searchQuery}
            filterOptions={filterOptions}
            onFilterChange={onFilterChange}
            onSearchQueryChange={onSearchQueryChange}
            onRefresh={onRefresh}
            onOpenChatGrid={onOpenChatGrid}
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
              {isDiscoveringSessions && (
                <EmptyCard
                  icon={<RefreshCw className="text-latte-overlay1 h-10 w-10 animate-spin" />}
                  title="Loading Sessions..."
                  description="Checking tmux sessions in the background. This should finish shortly."
                  className="py-12 sm:py-16"
                  iconWrapperClassName="bg-latte-surface1/50 h-20 w-20"
                  titleClassName="text-xl"
                  descriptionClassName="max-w-sm"
                />
              )}
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
              {groups.map((group) => {
                const repoScrollKey = createRepoPinKey(group.repoRoot);
                return (
                  <div
                    key={group.repoRoot ?? "no-repo"}
                    data-repo-scroll-key={repoScrollKey}
                    ref={(element) => registerRepoScrollTarget(repoScrollKey, element)}
                  >
                    <SessionGroupSection
                      group={group}
                      allSessions={sessions}
                      nowMs={nowMs}
                      launchPendingSessions={launchPendingSessions}
                      launchConfig={launchConfig}
                      requestWorktrees={requestWorktrees}
                      onLaunchAgentInSession={onLaunchAgentInSession}
                      onTouchRepoPin={handleTouchRepoPinWithScroll}
                      onTouchPanePin={handleTouchPanePinWithScroll}
                      onRegisterPaneScrollTarget={registerPaneScrollTarget}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

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
};
