import { useMemo } from "react";

import { useSessions } from "@/state/session-context";
import { useTheme } from "@/state/theme-context";

import type { SessionApi } from "../atoms/sessionDetailAtoms";

export type SessionDetailAtomSnapshot = {
  paneId: string;
  sessions: ReturnType<typeof useSessions>["sessions"];
  connected: boolean;
  connectionStatus: ReturnType<typeof useSessions>["connectionStatus"];
  connectionIssue: string | null;
  highlightCorrections: ReturnType<typeof useSessions>["highlightCorrections"];
  fileNavigatorConfig: ReturnType<typeof useSessions>["fileNavigatorConfig"];
  launchConfig: ReturnType<typeof useSessions>["launchConfig"];
  resolvedTheme: ReturnType<typeof useTheme>["resolvedTheme"];
  sessionApi: SessionApi;
};

export const useSessionDetailAtomSnapshot = (paneId: string): SessionDetailAtomSnapshot => {
  const {
    sessions,
    connected,
    connectionStatus,
    connectionIssue,
    highlightCorrections,
    fileNavigatorConfig,
    launchConfig,
    refreshSessions,
    reconnect,
    requestWorktrees,
    requestDiffSummary,
    requestDiffFile,
    requestCommitLog,
    requestCommitDetail,
    requestCommitFile,
    requestStateTimeline,
    requestRepoNotes,
    requestRepoFileTree,
    requestRepoFileSearch,
    requestRepoFileContent,
    requestScreen,
    focusPane,
    killPane,
    killWindow,
    launchAgentInSession,
    uploadImageAttachment,
    sendText,
    sendKeys,
    sendRaw,
    touchSession,
    updateSessionTitle,
    createRepoNote,
    updateRepoNote,
    deleteRepoNote,
  } = useSessions();
  const { resolvedTheme } = useTheme();

  const sessionApi = useMemo<SessionApi>(
    () => ({
      reconnect,
      refreshSessions,
      requestWorktrees,
      requestDiffSummary,
      requestDiffFile,
      requestCommitLog,
      requestCommitDetail,
      requestCommitFile,
      requestStateTimeline,
      requestRepoNotes,
      requestRepoFileTree,
      requestRepoFileSearch,
      requestRepoFileContent,
      requestScreen,
      focusPane,
      killPane,
      killWindow,
      launchAgentInSession,
      uploadImageAttachment,
      sendText,
      sendKeys,
      sendRaw,
      touchSession,
      updateSessionTitle,
      createRepoNote,
      updateRepoNote,
      deleteRepoNote,
    }),
    [
      reconnect,
      refreshSessions,
      requestWorktrees,
      requestDiffSummary,
      requestDiffFile,
      requestCommitLog,
      requestCommitDetail,
      requestCommitFile,
      requestStateTimeline,
      requestRepoNotes,
      requestRepoFileTree,
      requestRepoFileSearch,
      requestRepoFileContent,
      requestScreen,
      focusPane,
      killPane,
      killWindow,
      launchAgentInSession,
      uploadImageAttachment,
      sendText,
      sendKeys,
      sendRaw,
      touchSession,
      updateSessionTitle,
      createRepoNote,
      updateRepoNote,
      deleteRepoNote,
    ],
  );

  return useMemo<SessionDetailAtomSnapshot>(
    () => ({
      paneId,
      sessions,
      connected,
      connectionStatus,
      connectionIssue,
      highlightCorrections,
      fileNavigatorConfig,
      launchConfig,
      resolvedTheme,
      sessionApi,
    }),
    [
      paneId,
      sessions,
      connected,
      connectionStatus,
      connectionIssue,
      highlightCorrections,
      fileNavigatorConfig,
      launchConfig,
      resolvedTheme,
      sessionApi,
    ],
  );
};
