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
import { createContext, useCallback, useContext, useEffect, useMemo, useRef } from "react";

import { API_ERROR_MESSAGES } from "@/lib/api-messages";
import {
  buildNotificationSessionTitleFingerprint,
  syncLocalNotificationSessionTitles,
  toNotificationSessionTitleEntries,
} from "@/lib/notification-session-title-store";

import { defaultLaunchConfig, type LaunchAgentRequestOptions } from "./launch-agent-options";
import {
  type SessionConnectionStatus,
  sessionFileNavigatorConfigAtom,
  sessionHighlightCorrectionsAtom,
  sessionLaunchConfigAtom,
  sessionWorkspaceTabsDisplayModeAtom,
} from "./session-state-atoms";
import { useSessionApi } from "./use-session-api";
import { useSessionConnectionState } from "./use-session-connection-state";
import { useSessionPolling } from "./use-session-polling";
import { useSessionStore } from "./use-session-store";
import { useSessionToken } from "./use-session-token";

type SessionContextValue = {
  token: string | null;
  apiBaseUrl: string | null;
  authError: string | null;
  sessions: SessionSummary[];
  connected: boolean;
  connectionStatus: SessionConnectionStatus;
  connectionIssue: string | null;
  highlightCorrections: HighlightCorrectionConfig;
  fileNavigatorConfig: ClientFileNavigatorConfig;
  launchConfig: LaunchConfig;
  setToken: (token: string | null) => void;
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

const SessionContext = createContext<SessionContextValue | null>(null);

const SessionRuntime = ({ children }: { children: ReactNode }) => {
  const { token, setToken, apiBaseUrl } = useSessionToken();
  const { sessions, setSessions, updateSession, removeSession, getSessionDetail } =
    useSessionStore();
  const highlightCorrections = useAtomValue(sessionHighlightCorrectionsAtom);
  const fileNavigatorConfig = useAtomValue(sessionFileNavigatorConfigAtom);
  const launchConfig = useAtomValue(sessionLaunchConfigAtom);
  const setHighlightCorrections = useSetAtom(sessionHighlightCorrectionsAtom);
  const setFileNavigatorConfig = useSetAtom(sessionFileNavigatorConfigAtom);
  const setWorkspaceTabsDisplayMode = useSetAtom(sessionWorkspaceTabsDisplayModeAtom);
  const setLaunchConfig = useSetAtom(sessionLaunchConfigAtom);
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
  const authError = !hasToken
    ? API_ERROR_MESSAGES.missingToken
    : connectionIssue != null && /unauthorized/i.test(connectionIssue)
      ? connectionIssue
      : null;
  const notificationTitleFingerprintRef = useRef<string>("");

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
    onWorkspaceTabsDisplayMode: setWorkspaceTabsDisplayMode,
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
    setWorkspaceTabsDisplayMode("all");
    setLaunchConfig(defaultLaunchConfig);
  }, [setFileNavigatorConfig, setLaunchConfig, setWorkspaceTabsDisplayMode, token]);

  useEffect(() => {
    if (!hasToken) {
      notificationTitleFingerprintRef.current = "";
      return;
    }
    const nextEntries = toNotificationSessionTitleEntries(sessions);
    const nextFingerprint = buildNotificationSessionTitleFingerprint(nextEntries);
    if (notificationTitleFingerprintRef.current === nextFingerprint) {
      return;
    }
    notificationTitleFingerprintRef.current = nextFingerprint;
    void syncLocalNotificationSessionTitles(nextEntries).catch(() => undefined);
  }, [hasToken, sessions]);

  const sessionApi = useMemo(
    () => ({
      setToken,
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
      setToken,
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

  const contextValue = useMemo<SessionContextValue>(
    () => ({
      token,
      apiBaseUrl,
      authError,
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
      apiBaseUrl,
      authError,
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

  return <SessionContext.Provider value={contextValue}>{children}</SessionContext.Provider>;
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
  const context = useContext(SessionContext);
  if (context == null) {
    throw new Error("SessionProvider is required");
  }
  return context;
};
