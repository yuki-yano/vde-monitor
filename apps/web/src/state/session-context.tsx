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
import { Provider as JotaiProvider, createStore, useAtomValue, useSetAtom } from "jotai";
import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef } from "react";

import { API_ERROR_MESSAGES } from "@/lib/api-messages";
import {
  buildNotificationSessionTitleFingerprint,
  syncLocalNotificationSessionTitles,
  toNotificationSessionTitleEntries,
} from "@/lib/notification-session-title-store";

import { type LaunchAgentRequestOptions, defaultLaunchConfig } from "./launch-agent-options";
import {
  type SessionConnectionStatus,
  sessionFileNavigatorConfigAtom,
  sessionHighlightCorrectionsAtom,
  sessionLaunchConfigAtom,
  sessionWorkspaceTabsDisplayModeAtom,
} from "./session-state-atoms";
import { useSessionApi as useSessionApiHook } from "./use-session-api";
import { useSessionConnectionState } from "./use-session-connection-state";
import { useSessionPolling } from "./use-session-polling";
import { useSessionStore } from "./use-session-store";
import { useSessionToken } from "./use-session-token";

// ---------------------------------------------------------------------------
// Data context — reactive fields; consumers re-render when these change
// ---------------------------------------------------------------------------

type SessionDataContextValue = {
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
  getSessionDetail: (paneId: string) => SessionDetail | null;
};

// ---------------------------------------------------------------------------
// API context — stable method references; identity does not change on data updates
// ---------------------------------------------------------------------------

type SessionApiContextValue = {
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
  resetSessionTitle: (paneId: string) => Promise<void>;
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
};

// ---------------------------------------------------------------------------
// Contexts
// ---------------------------------------------------------------------------

const SessionDataContext = createContext<SessionDataContextValue | null>(null);
const SessionApiContext = createContext<SessionApiContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider implementation
// ---------------------------------------------------------------------------

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
    resetSessionTitle,
    touchSession,
    createRepoNote,
    updateRepoNote,
    deleteRepoNote,
  } = useSessionApiHook({
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

  // Stable API context — memoized so its identity only changes when API deps change,
  // not on every data update (sessions, connected, etc.)
  const sessionApiValue = useMemo<SessionApiContextValue>(
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
      resetSessionTitle,
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
      resetSessionTitle,
      createRepoNote,
      updateRepoNote,
      deleteRepoNote,
    ],
  );

  // Data context — updates whenever reactive state changes
  const sessionDataValue = useMemo<SessionDataContextValue>(
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
      getSessionDetail,
    ],
  );

  return (
    <SessionDataContext.Provider value={sessionDataValue}>
      <SessionApiContext.Provider value={sessionApiValue}>{children}</SessionApiContext.Provider>
    </SessionDataContext.Provider>
  );
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

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export const useSessionData = (): SessionDataContextValue => {
  const context = useContext(SessionDataContext);
  if (context == null) {
    throw new Error("SessionProvider is required");
  }
  return context;
};

export const useSessionApi = (): SessionApiContextValue => {
  const context = useContext(SessionApiContext);
  if (context == null) {
    throw new Error("SessionProvider is required");
  }
  return context;
};

/** Backward-compatible hook — merges data and API. Prefer useSessionData/useSessionApi in new code. */
export const useSessions = (): SessionDataContextValue & SessionApiContextValue => {
  const data = useSessionData();
  const api = useSessionApi();
  return { ...data, ...api };
};
