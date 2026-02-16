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
import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from "react";

import { defaultLaunchConfig, type LaunchAgentRequestOptions } from "./launch-agent-options";
import { useSessionApi } from "./use-session-api";
import { useSessionConnectionState } from "./use-session-connection-state";
import { useSessionPolling } from "./use-session-polling";
import { useSessionStore } from "./use-session-store";
import { useSessionToken } from "./use-session-token";

type SessionContextValue = {
  token: string | null;
  sessions: SessionSummary[];
  connected: boolean;
  connectionStatus: "healthy" | "degraded" | "disconnected";
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

const SessionContext = createContext<SessionContextValue | null>(null);

export const SessionProvider = ({ children }: { children: ReactNode }) => {
  const { token, apiBaseUrl } = useSessionToken();
  const { sessions, setSessions, updateSession, removeSession, getSessionDetail } =
    useSessionStore();
  const [highlightCorrections, setHighlightCorrections] = useState<HighlightCorrectionConfig>({
    codex: true,
    claude: true,
  });
  const [fileNavigatorConfig, setFileNavigatorConfig] = useState<ClientFileNavigatorConfig>({
    autoExpandMatchLimit: 100,
  });
  const [launchConfig, setLaunchConfig] = useState<LaunchConfig>(defaultLaunchConfig);
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

  const applyHighlightCorrections = useCallback((nextHighlight: HighlightCorrectionConfig) => {
    setHighlightCorrections((prev) => ({ ...prev, ...nextHighlight }));
  }, []);

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
  }, [token]);

  return (
    <SessionContext.Provider
      value={{
        token,
        sessions,
        connected,
        connectionStatus,
        connectionIssue,
        highlightCorrections,
        fileNavigatorConfig,
        launchConfig,
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
        getSessionDetail,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
};

export const useSessions = () => {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error("SessionContext not found");
  }
  return context;
};
