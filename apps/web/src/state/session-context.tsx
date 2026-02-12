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
  RawItem,
  RepoFileContent,
  RepoFileSearchPage,
  RepoFileTreePage,
  ScreenResponse,
  SessionDetail,
  SessionStateTimeline,
  SessionStateTimelineRange,
  SessionSummary,
} from "@vde-monitor/shared";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from "react";

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
  reconnect: () => void;
  refreshSessions: () => Promise<void>;
  requestDiffSummary: (paneId: string, options?: { force?: boolean }) => Promise<DiffSummary>;
  requestDiffFile: (
    paneId: string,
    path: string,
    rev?: string | null,
    options?: { force?: boolean },
  ) => Promise<DiffFile>;
  requestCommitLog: (
    paneId: string,
    options?: { limit?: number; skip?: number; force?: boolean },
  ) => Promise<CommitLog>;
  requestCommitDetail: (
    paneId: string,
    hash: string,
    options?: { force?: boolean },
  ) => Promise<CommitDetail>;
  requestCommitFile: (
    paneId: string,
    hash: string,
    path: string,
    options?: { force?: boolean },
  ) => Promise<CommitFileDiff>;
  requestStateTimeline: (
    paneId: string,
    options?: { range?: SessionStateTimelineRange; limit?: number },
  ) => Promise<SessionStateTimeline>;
  requestRepoFileTree: (
    paneId: string,
    options?: { path?: string; cursor?: string; limit?: number },
  ) => Promise<RepoFileTreePage>;
  requestRepoFileSearch: (
    paneId: string,
    query: string,
    options?: { cursor?: string; limit?: number },
  ) => Promise<RepoFileSearchPage>;
  requestRepoFileContent: (
    paneId: string,
    path: string,
    options?: { maxBytes?: number },
  ) => Promise<RepoFileContent>;
  requestScreen: (
    paneId: string,
    options: { lines?: number; mode?: "text" | "image"; cursor?: string },
  ) => Promise<ScreenResponse>;
  focusPane: (paneId: string) => Promise<CommandResponse>;
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
    updateSessionTitle,
    touchSession,
  } = useSessionApi({
    token,
    apiBaseUrl,
    onSessions: setSessions,
    onConnectionIssue: setConnectionIssue,
    onSessionUpdated: updateSession,
    onSessionRemoved: removeSession,
    onHighlightCorrections: applyHighlightCorrections,
    onFileNavigatorConfig: setFileNavigatorConfig,
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
        reconnect,
        refreshSessions,
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
