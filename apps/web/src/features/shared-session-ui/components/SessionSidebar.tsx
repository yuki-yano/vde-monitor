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
import { SessionSidebarMainSections } from "@/features/shared-session-ui/components/SessionSidebarMainSections";
import { SessionSidebarPreviewPopover } from "@/features/shared-session-ui/components/SessionSidebarPreviewPopover";
import { useSessionSidebarActions } from "@/features/shared-session-ui/hooks/useSessionSidebarActions";
import { useSessionSidebarGroups } from "@/features/shared-session-ui/hooks/useSessionSidebarGroups";
import { useSessionSidebarMainSectionsViewModel } from "@/features/shared-session-ui/hooks/useSessionSidebarMainSectionsViewModel";
import { useSessionSidebarPreviewPopover } from "@/features/shared-session-ui/hooks/useSessionSidebarPreviewPopover";
import { useSidebarPreview } from "@/features/shared-session-ui/hooks/useSidebarPreview";
import { cn } from "@/lib/cn";
import type { SessionGroup } from "@/lib/session-group";
import type { Theme } from "@/lib/theme";
import type { LaunchAgentHandler } from "@/state/launch-agent-options";

type SessionSidebarState = {
  sessionGroups: SessionGroup[];
  getRepoSortAnchorAt?: (repoRoot: string | null) => number | null;
  sidebarWidth?: number;
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
  onLaunchAgentInSession?: LaunchAgentHandler;
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
  const mainSectionsViewModel = useSessionSidebarMainSectionsViewModel({
    totalSessions,
    repoCount,
    filter,
    onFilterChange: handleFilterChange,
    list: {
      onListScroll: handleListScroll,
      sidebarGroups,
      sidebarWidth,
      nowMs,
      currentPaneId,
      focusPendingPaneIds,
      launchPendingSessions,
      launchConfig,
      requestWorktrees,
      onHoverStart: handleHoverStart,
      onHoverEnd: handleHoverEnd,
      onFocus: handleFocus,
      onBlur: handleBlur,
      onSelect: handleSelect,
      onFocusPane: handleFocusPane,
      onLaunchAgentInSession: handleLaunchAgentInSession,
      onTouchSession: handleTouchPane,
      onTouchRepoPin: handleTouchRepoPin,
      registerItemRef,
    },
  });
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

      <SessionSidebarMainSections viewModel={mainSectionsViewModel} />

      {previewPopover && <SessionSidebarPreviewPopover {...previewPopover} />}
    </Card>
  );
};
