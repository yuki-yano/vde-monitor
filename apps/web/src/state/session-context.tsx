import type {
  AllowedKey,
  ClientFileNavigatorConfig,
  CommandResponse,
  CommitDetail,
  CommitFileDiff,
  CommitLog,
  DiffFile,
  DiffSummary,
  HighlightCorrectionConfig,
  ImageAttachment,
  LaunchCommandResponse,
  LaunchConfig,
  RawItem,
  RepoFileContent,
  RepoFileSearchPage,
  RepoFileTreePage,
  RepoNote,
  ScreenResponse,
  SessionDetail,
  SessionStateTimeline,
  SessionStateTimelineRange,
  SessionStateTimelineScope,
  SessionSummary,
  WorktreeList,
} from "@vde-monitor/shared";
import { createStore, Provider as JotaiProvider, useAtomValue, useSetAtom } from "jotai";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef } from "react";

import { defaultLaunchConfig, type LaunchAgentRequestOptions } from "./launch-agent-options";
import {
  type SessionApi,
  sessionApiAtom,
  sessionConnectedAtom,
  sessionConnectionIssueAtom,
  type SessionConnectionStatus,
  sessionConnectionStatusAtom,
  sessionFileNavigatorConfigAtom,
  sessionHighlightCorrectionsAtom,
  sessionLaunchConfigAtom,
  sessionTokenAtom,
} from "./session-state-atoms";
import { useSessionApi } from "./use-session-api";
import { useSessionConnectionState } from "./use-session-connection-state";
import { useSessionPolling } from "./use-session-polling";
import { getSessionDetailByPaneAtom, sessionsAtom, useSessionStore } from "./use-session-store";
import { useSessionToken } from "./use-session-token";

type SessionContextValue = {
  token: string | null;
  sessions: SessionSummary[];
  connected: boolean;
  connectionStatus: SessionConnectionStatus;
  connectionIssue: string | null;
  highlightCorrections: HighlightCorrectionConfig;
  fileNavigatorConfig: ClientFileNavigatorConfig;
  launchConfig: LaunchConfig;
  reconnect: () => void;
  refreshSessions: () => Promise<void>;
  requestWorktrees: (paneId: string) => Promise<WorktreeList>;
  requestDiffSummary: (
    paneId: string,
    options?: { force?: boolean; worktreePath?: string },
  ) => Promise<DiffSummary>;
  requestDiffFile: (
    paneId: string,
    path: string,
    rev?: string | null,
    options?: { force?: boolean; worktreePath?: string },
  ) => Promise<DiffFile>;
  requestCommitLog: (
    paneId: string,
    options?: { limit?: number; skip?: number; force?: boolean; worktreePath?: string },
  ) => Promise<CommitLog>;
  requestCommitDetail: (
    paneId: string,
    hash: string,
    options?: { force?: boolean; worktreePath?: string },
  ) => Promise<CommitDetail>;
  requestCommitFile: (
    paneId: string,
    hash: string,
    path: string,
    options?: { force?: boolean; worktreePath?: string },
  ) => Promise<CommitFileDiff>;
  requestStateTimeline: (
    paneId: string,
    options?: {
      scope?: SessionStateTimelineScope;
      range?: SessionStateTimelineRange;
      limit?: number;
    },
  ) => Promise<SessionStateTimeline>;
  requestRepoNotes: (paneId: string) => Promise<RepoNote[]>;
  requestRepoFileTree: (
    paneId: string,
    options?: { path?: string; cursor?: string; limit?: number; worktreePath?: string },
  ) => Promise<RepoFileTreePage>;
  requestRepoFileSearch: (
    paneId: string,
    query: string,
    options?: { cursor?: string; limit?: number; worktreePath?: string },
  ) => Promise<RepoFileSearchPage>;
  requestRepoFileContent: (
    paneId: string,
    path: string,
    options?: { maxBytes?: number; worktreePath?: string },
  ) => Promise<RepoFileContent>;
  requestScreen: (
    paneId: string,
    options: { lines?: number; mode?: "text" | "image"; cursor?: string },
  ) => Promise<ScreenResponse>;
  focusPane: (paneId: string) => Promise<CommandResponse>;
  killPane: (paneId: string) => Promise<CommandResponse>;
  killWindow: (paneId: string) => Promise<CommandResponse>;
  launchAgentInSession: (
    sessionName: string,
    agent: "codex" | "claude",
    requestId: string,
    options?: LaunchAgentRequestOptions,
  ) => Promise<LaunchCommandResponse>;
  uploadImageAttachment: (paneId: string, file: File) => Promise<ImageAttachment>;
  sendText: (
    paneId: string,
    text: string,
    enter?: boolean,
    requestId?: string,
  ) => Promise<CommandResponse>;
  sendKeys: (paneId: string, keys: AllowedKey[]) => Promise<CommandResponse>;
  sendRaw: (paneId: string, items: RawItem[], unsafe?: boolean) => Promise<CommandResponse>;
  touchSession: (paneId: string) => Promise<void>;
  updateSessionTitle: (paneId: string, title: string | null) => Promise<void>;
  createRepoNote: (
    paneId: string,
    input: { title?: string | null; body: string },
  ) => Promise<RepoNote>;
  updateRepoNote: (
    paneId: string,
    noteId: string,
    input: { title?: string | null; body: string },
  ) => Promise<RepoNote>;
  deleteRepoNote: (paneId: string, noteId: string) => Promise<string>;
  getSessionDetail: (paneId: string) => SessionDetail | null;
};

const useSyncAtomValue = <T,>(value: T, setValue: (nextValue: T) => void) => {
  useEffect(() => {
    setValue(value);
  }, [setValue, value]);
};

const SessionRuntime = ({ children }: { children: ReactNode }) => {
  const { token, apiBaseUrl } = useSessionToken();
  const { setSessions, updateSession, removeSession } = useSessionStore();
  const setHighlightCorrections = useSetAtom(sessionHighlightCorrectionsAtom);
  const setFileNavigatorConfig = useSetAtom(sessionFileNavigatorConfigAtom);
  const setLaunchConfig = useSetAtom(sessionLaunchConfigAtom);
  const setToken = useSetAtom(sessionTokenAtom);
  const setConnected = useSetAtom(sessionConnectedAtom);
  const setConnectionStatus = useSetAtom(sessionConnectionStatusAtom);
  const setConnectionIssueAtom = useSetAtom(sessionConnectionIssueAtom);
  const setSessionApi = useSetAtom(sessionApiAtom);
  const {
    connectionIssue,
    setConnectionIssue,
    connected,
    authBlocked,
    pollBackoffMs,
    connectionStatus,
    handleRefreshResult: handleRefreshResultFromConnection,
    reconnect: reconnectWithConnectionState,
  } = useSessionConnectionState(token);

  const applyHighlightCorrections = useCallback(
    (nextHighlight: HighlightCorrectionConfig) => {
      setHighlightCorrections((prev) => ({ ...prev, ...nextHighlight }));
    },
    [setHighlightCorrections],
  );

  const hasToken = Boolean(token);

  const {
    refreshSessions: refreshSessionsApi,
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
    updateSessionTitle,
    touchSession,
    createRepoNote,
    updateRepoNote,
    deleteRepoNote,
  } = useSessionApi({
    token,
    apiBaseUrl,
    onSessions: setSessions,
    onConnectionIssue: setConnectionIssue,
    onSessionUpdated: updateSession,
    onSessionRemoved: removeSession,
    onHighlightCorrections: applyHighlightCorrections,
    onFileNavigatorConfig: setFileNavigatorConfig,
    onLaunchConfig: setLaunchConfig,
  });

  const refreshSessions = useCallback(async () => {
    if (!hasToken || authBlocked) {
      return;
    }
    const result = await refreshSessionsApi();
    handleRefreshResultFromConnection(result);
  }, [authBlocked, handleRefreshResultFromConnection, hasToken, refreshSessionsApi]);

  const reconnect = useCallback(() => {
    reconnectWithConnectionState(refreshSessions);
  }, [reconnectWithConnectionState, refreshSessions]);

  useSessionPolling({
    enabled: hasToken && !authBlocked,
    pollBackoffMs,
    refreshSessions,
  });

  useEffect(() => {
    setFileNavigatorConfig({ autoExpandMatchLimit: 100 });
    setLaunchConfig(defaultLaunchConfig);
  }, [setFileNavigatorConfig, setLaunchConfig, token]);

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

  useSyncAtomValue(token, setToken);
  useSyncAtomValue(connected, setConnected);
  useSyncAtomValue(connectionStatus, setConnectionStatus);
  useSyncAtomValue(connectionIssue, setConnectionIssueAtom);
  useSyncAtomValue(sessionApi, setSessionApi);

  return <>{children}</>;
};

export const SessionProvider = ({ children }: { children: ReactNode }) => {
  const storeRef = useRef<null | ReturnType<typeof createStore>>(null);
  if (storeRef.current == null) {
    storeRef.current = createStore();
  }

  return (
    <JotaiProvider store={storeRef.current}>
      <SessionRuntime>{children}</SessionRuntime>
    </JotaiProvider>
  );
};

export const useSessions = () => {
  const token = useAtomValue(sessionTokenAtom);
  const sessions = useAtomValue(sessionsAtom);
  const connected = useAtomValue(sessionConnectedAtom);
  const connectionStatus = useAtomValue(sessionConnectionStatusAtom);
  const connectionIssue = useAtomValue(sessionConnectionIssueAtom);
  const highlightCorrections = useAtomValue(sessionHighlightCorrectionsAtom);
  const fileNavigatorConfig = useAtomValue(sessionFileNavigatorConfigAtom);
  const launchConfig = useAtomValue(sessionLaunchConfigAtom);
  const sessionApi = useAtomValue(sessionApiAtom);
  const getSessionDetailFromPane = useAtomValue(getSessionDetailByPaneAtom);

  const getSessionDetail = useCallback(
    (paneId: string) => {
      return getSessionDetailFromPane(paneId);
    },
    [getSessionDetailFromPane],
  );

  return useMemo<SessionContextValue>(
    () => ({
      token,
      sessions,
      connected,
      connectionStatus,
      connectionIssue,
      highlightCorrections,
      fileNavigatorConfig,
      launchConfig,
      ...sessionApi,
      getSessionDetail,
    }),
    [
      token,
      sessions,
      connected,
      connectionStatus,
      connectionIssue,
      highlightCorrections,
      fileNavigatorConfig,
      launchConfig,
      sessionApi,
      getSessionDetail,
    ],
  );
};
