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
    reconnect,
    requestWorktrees,
    requestDiffSummary,
    requestDiffFile,
    requestCommitLog,
    requestCommitDetail,
    requestCommitFile,
    requestStateTimeline,
    requestRepoFileTree,
    requestRepoFileSearch,
    requestRepoFileContent,
    requestScreen,
    focusPane,
    uploadImageAttachment,
    sendText,
    sendKeys,
    sendRaw,
    touchSession,
    updateSessionTitle,
  } = useSessions();
  const { resolvedTheme } = useTheme();

  const sessionApi = useMemo<SessionApi>(
    () => ({
      reconnect,
      requestWorktrees,
      requestDiffSummary,
      requestDiffFile,
      requestCommitLog,
      requestCommitDetail,
      requestCommitFile,
      requestStateTimeline,
      requestRepoFileTree,
      requestRepoFileSearch,
      requestRepoFileContent,
      requestScreen,
      focusPane,
      uploadImageAttachment,
      sendText,
      sendKeys,
      sendRaw,
      touchSession,
      updateSessionTitle,
    }),
    [
      reconnect,
      requestWorktrees,
      requestDiffSummary,
      requestDiffFile,
      requestCommitLog,
      requestCommitDetail,
      requestCommitFile,
      requestStateTimeline,
      requestRepoFileTree,
      requestRepoFileSearch,
      requestRepoFileContent,
      requestScreen,
      focusPane,
      uploadImageAttachment,
      sendText,
      sendKeys,
      sendRaw,
      touchSession,
      updateSessionTitle,
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
      resolvedTheme,
      sessionApi,
    ],
  );
};
