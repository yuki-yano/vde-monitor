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
import { useCallback, useRef } from "react";

import { API_ERROR_MESSAGES } from "@/lib/api-messages";
import type { Theme } from "@/lib/theme";
import type { LaunchAgentRequestOptions } from "@/state/launch-agent-options";

import { useSessionDetailActions } from "./useSessionDetailActions";
import { useSessionLogs } from "./useSessionLogs";
import { useSessionTimeline } from "./useSessionTimeline";

const RESUME_WINDOW_TRANSITION_TIMEOUT_MS = 15_000;
const RESUME_WINDOW_TRANSITION_POLL_INTERVAL_MS = 300;

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const findSessionByPaneId = (sessions: SessionSummary[], paneId: string): SessionSummary | null => {
  return sessions.find((session) => session.paneId === paneId) ?? null;
};

const isAgentStoppedOnSourcePane = (session: SessionSummary | null): boolean => {
  return session?.agent === "unknown" && session.state === "SHELL";
};

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
    handleOpenPaneAfterResumeWindow,
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
  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;

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
        return result;
      }
      if (result.result.verification.status !== "verified") {
        await refreshSessions();
        setScreenError(`Launch verification: ${result.result.verification.status}`);
        return result;
      }
      if (result.resume?.fallbackReason) {
        await refreshSessions();
        setScreenError(`Resume fallback: ${result.resume.fallbackReason}`);
        return result;
      }
      const sourcePaneId = options?.resumeFromPaneId?.trim() ?? "";
      const shouldWaitForResumeTransition =
        options?.resumeTarget === "window" && sourcePaneId.length > 0;
      if (shouldWaitForResumeTransition) {
        const launchPaneId = result.result.paneId;
        const deadline = Date.now() + RESUME_WINDOW_TRANSITION_TIMEOUT_MS;
        let transitioned = false;

        while (Date.now() <= deadline) {
          await refreshSessions();
          const currentSessions = sessionsRef.current;
          const sourceSession = findSessionByPaneId(currentSessions, sourcePaneId);
          const launchedSession = findSessionByPaneId(currentSessions, launchPaneId);
          if (launchedSession && isAgentStoppedOnSourcePane(sourceSession)) {
            transitioned = true;
            break;
          }
          if (Date.now() >= deadline) {
            break;
          }
          await delay(RESUME_WINDOW_TRANSITION_POLL_INTERVAL_MS);
        }

        if (!transitioned) {
          setScreenError("Resume transition timeout: source pane did not return to shell state.");
          return result;
        }
        handleOpenPaneAfterResumeWindow(launchPaneId, sourcePaneId);
      } else {
        await refreshSessions();
      }
      setScreenError(null);
      return result;
    },
    [handleOpenPaneAfterResumeWindow, launchAgentInSession, refreshSessions, setScreenError],
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
