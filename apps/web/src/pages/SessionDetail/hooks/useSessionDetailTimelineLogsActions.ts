import type {
  CommandResponse,
  HighlightCorrectionConfig,
  ScreenResponse,
  SessionStateTimeline,
  SessionStateTimelineRange,
  SessionSummary,
} from "@vde-monitor/shared";
import { useCallback } from "react";

import type { Theme } from "@/lib/theme";

import { useSessionDetailActions } from "./useSessionDetailActions";
import { useSessionLogs } from "./useSessionLogs";
import { useSessionTimeline } from "./useSessionTimeline";

type UseSessionDetailTimelineLogsActionsArgs = {
  paneId: string;
  connected: boolean;
  connectionIssue: string | null;
  requestScreen: (
    paneId: string,
    options: { lines?: number; mode?: "text" | "image"; cursor?: string },
  ) => Promise<ScreenResponse>;
  requestStateTimeline: (
    paneId: string,
    options?: { range?: SessionStateTimelineRange; limit?: number },
  ) => Promise<SessionStateTimeline>;
  sessions: SessionSummary[];
  resolvedTheme: Theme;
  highlightCorrections: HighlightCorrectionConfig;
  touchSession: (paneId: string) => Promise<void>;
  focusPane: (paneId: string) => Promise<CommandResponse>;
  setScreenError: (error: string | null) => void;
  touchRepoSortAnchor: (repoRoot: string | null) => void;
  paneRepoRootMap: Map<string, string | null>;
  currentRepoRoot: string | null;
};

export const useSessionDetailTimelineLogsActions = ({
  paneId,
  connected,
  connectionIssue,
  requestScreen,
  requestStateTimeline,
  sessions,
  resolvedTheme,
  highlightCorrections,
  touchSession,
  focusPane,
  setScreenError,
  touchRepoSortAnchor,
  paneRepoRootMap,
  currentRepoRoot,
}: UseSessionDetailTimelineLogsActionsArgs) => {
  const timeline = useSessionTimeline({
    paneId,
    connected,
    requestStateTimeline,
    mobileDefaultCollapsed: true,
  });

  const logs = useSessionLogs({
    connected,
    connectionIssue,
    sessions,
    requestScreen,
    resolvedTheme,
    highlightCorrections,
  });

  const {
    handleOpenInNewTab,
    handleTouchSession,
    handleTouchPane,
    handleFocusPane,
    handleOpenPaneHere,
    handleOpenHere,
  } = useSessionDetailActions({
    paneId,
    selectedPaneId: logs.selectedPaneId,
    closeQuickPanel: logs.closeQuickPanel,
    closeLogModal: logs.closeLogModal,
    touchSession,
    focusPane,
    setScreenError,
  });

  const handleTouchRepoPin = useCallback(
    (repoRoot: string | null) => {
      touchRepoSortAnchor(repoRoot);
    },
    [touchRepoSortAnchor],
  );

  const handleTouchCurrentSession = useCallback(() => {
    touchRepoSortAnchor(currentRepoRoot);
    handleTouchSession();
  }, [touchRepoSortAnchor, currentRepoRoot, handleTouchSession]);

  const handleTouchPaneWithRepoAnchor = useCallback(
    (targetPaneId: string) => {
      touchRepoSortAnchor(paneRepoRootMap.get(targetPaneId) ?? null);
      handleTouchPane(targetPaneId);
    },
    [touchRepoSortAnchor, paneRepoRootMap, handleTouchPane],
  );

  return {
    timeline,
    logs,
    actions: {
      handleOpenInNewTab,
      handleFocusPane,
      handleOpenPaneHere,
      handleOpenHere,
      handleTouchRepoPin,
      handleTouchCurrentSession,
      handleTouchPaneWithRepoAnchor,
    },
  };
};
