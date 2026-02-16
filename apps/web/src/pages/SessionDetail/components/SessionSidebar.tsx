import type {
  HighlightCorrectionConfig,
  LaunchConfig,
  ScreenResponse,
  SessionStateTimeline,
  SessionStateTimelineRange,
  SessionStateTimelineScope,
  WorktreeList,
} from "@vde-monitor/shared";
import { memo, useCallback } from "react";

import { Card } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { SessionGroup } from "@/lib/session-group";
import type { Theme } from "@/lib/theme";
import type { LaunchAgentRequestOptions } from "@/state/launch-agent-options";

import { useSessionSidebarActions } from "../hooks/useSessionSidebarActions";
import { useSessionSidebarGroups } from "../hooks/useSessionSidebarGroups";
import { useSessionSidebarPreviewPopover } from "../hooks/useSessionSidebarPreviewPopover";
import { useSidebarPreview } from "../hooks/useSidebarPreview";
import { SessionSidebarMainSections } from "./SessionSidebarMainSections";
import { SessionSidebarPreviewPopover } from "./SessionSidebarPreviewPopover";

type SessionSidebarState = {
  sessionGroups: SessionGroup[];
  getRepoSortAnchorAt?: (repoRoot: string | null) => number | null;
  nowMs: number;
  connected: boolean;
  connectionIssue: string | null;
  launchConfig: LaunchConfig;
  requestWorktrees: (paneId: string) => Promise<WorktreeList>;
  requestStateTimeline: (
    paneId: string,
    options?: {
      scope?: SessionStateTimelineScope;
      range?: SessionStateTimelineRange;
      limit?: number;
    },
  ) => Promise<SessionStateTimeline>;
  requestScreen: (
    paneId: string,
    options: { lines?: number; mode?: "text" | "image"; cursor?: string },
  ) => Promise<ScreenResponse>;
  highlightCorrections: HighlightCorrectionConfig;
  resolvedTheme: Theme;
  currentPaneId?: string | null;
  className?: string;
};

type SessionSidebarActions = {
  onSelectSession?: (paneId: string) => void;
  onFocusPane?: (paneId: string) => Promise<void> | void;
  onLaunchAgentInSession?: (
    sessionName: string,
    agent: "codex" | "claude",
    options?: LaunchAgentRequestOptions,
  ) => Promise<void> | void;
  onTouchSession?: (paneId: string) => void;
  onTouchRepoPin?: (repoRoot: string | null) => void;
};

type SessionSidebarProps = {
  state: SessionSidebarState;
  actions: SessionSidebarActions;
};

const SidebarBackdrop = memo(() => (
  <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-none rounded-r-3xl">
    <div className="bg-latte-lavender/15 absolute -left-10 top-10 h-32 w-32 rounded-full blur-3xl" />
    <div className="bg-latte-peach/15 absolute -right-12 top-40 h-36 w-36 rounded-full blur-3xl" />
    <div className="from-latte-lavender/70 via-latte-peach/40 absolute left-0 top-0 h-full w-[2px] bg-gradient-to-b to-transparent" />
    <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-white/5 to-transparent" />
  </div>
));

SidebarBackdrop.displayName = "SidebarBackdrop";

export const SessionSidebar = ({ state, actions }: SessionSidebarProps) => {
  const {
    sessionGroups,
    getRepoSortAnchorAt,
    nowMs,
    connected,
    connectionIssue,
    launchConfig,
    requestWorktrees,
    requestStateTimeline,
    requestScreen,
    highlightCorrections,
    resolvedTheme,
    currentPaneId,
    className,
  } = state;
  const { onSelectSession, onFocusPane, onLaunchAgentInSession, onTouchSession, onTouchRepoPin } =
    actions;

  const {
    filter,
    focusPendingPaneIds,
    launchPendingSessions,
    handleSelectSession,
    handleFocusPane,
    handleLaunchAgentInSession,
    handleFilterChange,
    handleTouchRepoPin,
    handleTouchPane,
  } = useSessionSidebarActions({
    onSelectSession,
    onFocusPane,
    onLaunchAgentInSession,
    onTouchSession,
    onTouchRepoPin,
  });

  const { sidebarGroups, totalSessions, repoCount, sessionIndex } = useSessionSidebarGroups({
    sessionGroups,
    filter,
    getRepoSortAnchorAt,
  });

  const {
    preview,
    handleHoverStart,
    handleHoverEnd,
    handleFocus,
    handleBlur,
    handleSelect: handlePreviewSelect,
    handleListScroll,
    registerItemRef,
  } = useSidebarPreview({
    sessionIndex,
    currentPaneId,
    connected,
    connectionIssue,
    requestStateTimeline,
    requestScreen,
    resolvedTheme,
    highlightCorrections,
  });

  const handleSelect = useCallback(
    (paneId: string) => {
      handleSelectSession(paneId);
      handlePreviewSelect();
    },
    [handlePreviewSelect, handleSelectSession],
  );
  const previewPopover = useSessionSidebarPreviewPopover({
    preview,
    currentPaneId,
  });

  return (
    <Card
      className={cn(
        "border-latte-surface1/70 bg-latte-mantle/80 shadow-popover relative flex h-full flex-col p-4",
        className,
      )}
    >
      <SidebarBackdrop />

      <SessionSidebarMainSections
        totalSessions={totalSessions}
        repoCount={repoCount}
        filter={filter}
        onFilterChange={handleFilterChange}
        onListScroll={handleListScroll}
        sidebarGroups={sidebarGroups}
        nowMs={nowMs}
        currentPaneId={currentPaneId}
        focusPendingPaneIds={focusPendingPaneIds}
        launchPendingSessions={launchPendingSessions}
        launchConfig={launchConfig}
        requestWorktrees={requestWorktrees}
        onHoverStart={handleHoverStart}
        onHoverEnd={handleHoverEnd}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onSelect={handleSelect}
        onFocusPane={handleFocusPane}
        onLaunchAgentInSession={handleLaunchAgentInSession}
        onTouchSession={handleTouchPane}
        onTouchRepoPin={handleTouchRepoPin}
        registerItemRef={registerItemRef}
      />

      {previewPopover && <SessionSidebarPreviewPopover {...previewPopover} />}
    </Card>
  );
};
