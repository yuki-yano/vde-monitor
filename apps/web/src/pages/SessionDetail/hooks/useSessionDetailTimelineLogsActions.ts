import type {
  CommandResponse,
  HighlightCorrectionConfig,
  LaunchCommandResponse,
  ScreenResponse,
  SessionStateTimeline,
  SessionStateTimelineRange,
  SessionStateTimelineScope,
  SessionSummary,
} from "@vde-monitor/shared";
import { useCallback } from "react";

import { API_ERROR_MESSAGES } from "@/lib/api-messages";
import type { Theme } from "@/lib/theme";
import type { LaunchAgentRequestOptions } from "@/state/launch-agent-options";

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
    options?: {
      scope?: SessionStateTimelineScope;
      range?: SessionStateTimelineRange;
      limit?: number;
    },
  ) => Promise<SessionStateTimeline>;
  sessions: SessionSummary[];
  resolvedTheme: Theme;
  highlightCorrections: HighlightCorrectionConfig;
  touchSession: (paneId: string) => Promise<void>;
  focusPane: (paneId: string) => Promise<CommandResponse>;
  refreshSessions: () => Promise<void>;
  launchAgentInSession: (
    sessionName: string,
    agent: "codex" | "claude",
    requestId: string,
    options?: LaunchAgentRequestOptions,
  ) => Promise<LaunchCommandResponse>;
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
  refreshSessions,
  launchAgentInSession,
  setScreenError,
  touchRepoSortAnchor,
  paneRepoRootMap,
  currentRepoRoot,
}: UseSessionDetailTimelineLogsActionsArgs) => {
  const createRequestId = () => {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    return `launch-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  };

  const timeline = useSessionTimeline({
    paneId,
    connected,
    requestStateTimeline,
    hasRepoTimeline: currentRepoRoot != null,
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
    handleOpenPaneInNewWindow,
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

  const handleLaunchAgentInSession = useCallback(
    async (sessionName: string, agent: "codex" | "claude", options?: LaunchAgentRequestOptions) => {
      const result = await launchAgentInSession(sessionName, agent, createRequestId(), options);
      if (!result.ok) {
        setScreenError(result.error?.message ?? API_ERROR_MESSAGES.launchAgent);
        return;
      }
      await refreshSessions();
      if (result.result.verification.status !== "verified") {
        setScreenError(`Launch verification: ${result.result.verification.status}`);
        return;
      }
      setScreenError(null);
    },
    [launchAgentInSession, refreshSessions, setScreenError],
  );

  return {
    timeline,
    logs,
    actions: {
      handleOpenPaneInNewWindow,
      handleOpenInNewTab,
      handleFocusPane,
      handleOpenPaneHere,
      handleOpenHere,
      handleTouchRepoPin,
      handleLaunchAgentInSession,
      handleTouchCurrentSession,
      handleTouchPaneWithRepoAnchor,
    },
  };
};
