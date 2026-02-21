import {
  type ApiEnvelope,
  type ApiError,
  type ClientFileNavigatorConfig,
  type CommandResponse,
  type HighlightCorrectionConfig,
  type LaunchCommandResponse,
  type LaunchConfig,
  type ScreenResponse,
  type SessionSummary,
  type WorkspaceTabsDisplayMode,
} from "@vde-monitor/shared";
import { useCallback, useMemo, useRef } from "react";

import { API_ERROR_MESSAGES } from "@/lib/api-messages";

import { createSessionActionRequests } from "./session-api-action-requests";
import { createApiClient } from "./session-api-contract";
import { createSessionQueryRequests } from "./session-api-query-requests";
import {
  mutateSession as executeMutateSession,
  refreshSessions as executeRefreshSessions,
  requestCommand as executeRequestCommand,
  requestLaunchCommand as executeRequestLaunchCommand,
  requestSessionField as executeRequestSessionField,
} from "./session-api-request-executors";
import { createSessionScreenRequest } from "./session-api-screen-request";
import {
  buildPaneHashParam,
  buildPaneNoteParam,
  buildPaneParam,
  type RefreshSessionsResult,
} from "./session-api-utils";

type UseSessionApiParams = {
  token: string | null;
  apiBaseUrl?: string | null;
  onSessions: (sessions: SessionSummary[]) => void;
  onConnectionIssue: (message: string | null) => void;
  onSessionUpdated: (session: SessionSummary) => void;
  onSessionRemoved: (paneId: string) => void;
  onHighlightCorrections: (config: HighlightCorrectionConfig) => void;
  onFileNavigatorConfig: (config: ClientFileNavigatorConfig) => void;
  onWorkspaceTabsDisplayMode?: (displayMode: WorkspaceTabsDisplayMode) => void;
  onLaunchConfig?: (config: LaunchConfig) => void;
};

type PaneParam = ReturnType<typeof buildPaneParam>;
type PaneHashParam = ReturnType<typeof buildPaneHashParam>;
type NoteIdParam = ReturnType<typeof buildPaneNoteParam>;

export type { RefreshSessionsResult } from "./session-api-utils";

export const useSessionApi = ({
  token,
  apiBaseUrl,
  onSessions,
  onConnectionIssue,
  onSessionUpdated,
  onSessionRemoved,
  onHighlightCorrections,
  onFileNavigatorConfig,
  onWorkspaceTabsDisplayMode,
  onLaunchConfig,
}: UseSessionApiParams) => {
  const ensureToken = useCallback(() => {
    if (!token) {
      throw new Error(API_ERROR_MESSAGES.missingToken);
    }
  }, [token]);

  const buildApiError = useCallback(
    (code: ApiError["code"], message: string): ApiError => ({ code, message }),
    [],
  );

  const isPaneMissingError = useCallback((error?: ApiError | null) => {
    if (!error) return false;
    if (error.code === "INVALID_PANE") return true;
    return error.code === "NOT_FOUND" && error.message === "pane not found";
  }, []);

  const handleSessionMissing = useCallback(
    (paneId: string, res: Response, data: ApiEnvelope<unknown> | null) => {
      if (isPaneMissingError(data?.error) || res.status === 410) {
        onSessionRemoved(paneId);
      }
    },
    [isPaneMissingError, onSessionRemoved],
  );

  const authHeaders = useMemo(
    (): Record<string, string> => (token ? { Authorization: `Bearer ${token}` } : {}),
    [token],
  );
  const apiBasePath = useMemo(() => {
    const normalized = apiBaseUrl?.trim();
    return normalized && normalized.length > 0 ? normalized : "/api";
  }, [apiBaseUrl]);
  const apiClient = useMemo(
    () => createApiClient(apiBasePath, authHeaders),
    [apiBasePath, authHeaders],
  );
  const screenInFlightRef = useRef(new Map<string, Promise<ScreenResponse>>());

  const refreshSessions = useCallback(async (): Promise<RefreshSessionsResult> => {
    return executeRefreshSessions({
      token,
      request: apiClient.sessions.$get(),
      onSessions,
      onConnectionIssue,
      onHighlightCorrections,
      onFileNavigatorConfig,
      onWorkspaceTabsDisplayMode,
      onLaunchConfig,
    });
  }, [
    apiClient,
    onConnectionIssue,
    onFileNavigatorConfig,
    onHighlightCorrections,
    onLaunchConfig,
    onWorkspaceTabsDisplayMode,
    onSessions,
    token,
  ]);

  const requestSessionField = useCallback(
    async <T, K extends keyof T>({
      paneId,
      request,
      field,
      fallbackMessage,
      includeStatus,
    }: {
      paneId: string;
      request: Promise<Response>;
      field: K;
      fallbackMessage: string;
      includeStatus?: boolean;
    }): Promise<NonNullable<T[K]>> =>
      executeRequestSessionField({
        paneId,
        request,
        field,
        fallbackMessage,
        includeStatus,
        ensureToken,
        onConnectionIssue,
        handleSessionMissing,
      }),
    [ensureToken, handleSessionMissing, onConnectionIssue],
  );

  const mutateSession = useCallback(
    async (paneId: string, request: Promise<Response>, fallbackMessage: string) =>
      executeMutateSession({
        paneId,
        request,
        fallbackMessage,
        ensureToken,
        onConnectionIssue,
        handleSessionMissing,
        onSessionUpdated,
        refreshSessions,
      }),
    [ensureToken, handleSessionMissing, onConnectionIssue, onSessionUpdated, refreshSessions],
  );

  const requestPaneField = useCallback(
    async <T, K extends keyof T>({
      paneId,
      request,
      field,
      fallbackMessage,
    }: {
      paneId: string;
      request: Promise<Response>;
      field: K;
      fallbackMessage: string;
    }) =>
      requestSessionField<T, K>({
        paneId,
        request,
        field,
        fallbackMessage,
        includeStatus: true,
      }),
    [requestSessionField],
  );

  const requestPaneQueryField = useCallback(
    async <T, K extends keyof T>({
      paneId,
      request,
      field,
      fallbackMessage,
    }: {
      paneId: string;
      request: (param: PaneParam) => Promise<Response>;
      field: K;
      fallbackMessage: string;
    }) =>
      requestPaneField<T, K>({
        paneId,
        request: request(buildPaneParam(paneId)),
        field,
        fallbackMessage,
      }),
    [requestPaneField],
  );

  const requestPaneHashField = useCallback(
    async <T, K extends keyof T>({
      paneId,
      hash,
      request,
      field,
      fallbackMessage,
    }: {
      paneId: string;
      hash: string;
      request: (param: PaneHashParam) => Promise<Response>;
      field: K;
      fallbackMessage: string;
    }) =>
      requestPaneField<T, K>({
        paneId,
        request: request(buildPaneHashParam(paneId, hash)),
        field,
        fallbackMessage,
      }),
    [requestPaneField],
  );

  const requestPaneNoteField = useCallback(
    async <T, K extends keyof T>({
      paneId,
      noteId,
      request,
      field,
      fallbackMessage,
    }: {
      paneId: string;
      noteId: string;
      request: (param: NoteIdParam) => Promise<Response>;
      field: K;
      fallbackMessage: string;
    }) =>
      requestPaneField<T, K>({
        paneId,
        request: request(buildPaneNoteParam(paneId, noteId)),
        field,
        fallbackMessage,
      }),
    [requestPaneField],
  );

  const {
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
  } = useMemo(
    () =>
      createSessionQueryRequests({
        apiClient,
        requestPaneQueryField,
        requestPaneHashField,
      }),
    [apiClient, requestPaneHashField, requestPaneQueryField],
  );

  const requestScreen = useMemo(
    () =>
      createSessionScreenRequest({
        apiClient,
        screenInFlightMap: screenInFlightRef.current,
        ensureToken,
        onConnectionIssue,
        handleSessionMissing,
        isPaneMissingError,
        onSessionRemoved,
        buildApiError,
      }),
    [
      apiClient,
      buildApiError,
      ensureToken,
      handleSessionMissing,
      isPaneMissingError,
      onConnectionIssue,
      onSessionRemoved,
      screenInFlightRef,
    ],
  );

  const requestCommand = useCallback(
    async (
      paneId: string,
      request: (signal?: AbortSignal) => Promise<Response>,
      fallbackMessage: string,
      requestTimeoutMs?: number,
    ): Promise<CommandResponse> =>
      executeRequestCommand({
        paneId,
        request,
        fallbackMessage,
        requestTimeoutMs,
        ensureToken,
        onConnectionIssue,
        handleSessionMissing,
        buildApiError,
        isPaneMissingError,
        onSessionRemoved,
      }),
    [
      buildApiError,
      ensureToken,
      handleSessionMissing,
      isPaneMissingError,
      onConnectionIssue,
      onSessionRemoved,
    ],
  );

  const requestLaunchCommand = useCallback(
    async (
      request: (signal?: AbortSignal) => Promise<Response>,
      fallbackMessage: string,
      requestTimeoutMs?: number,
    ): Promise<LaunchCommandResponse> =>
      executeRequestLaunchCommand({
        request,
        fallbackMessage,
        requestTimeoutMs,
        ensureToken,
        onConnectionIssue,
        buildApiError,
      }),
    [buildApiError, ensureToken, onConnectionIssue],
  );

  const runPaneCommand = useCallback(
    (
      paneId: string,
      fallbackMessage: string,
      request: (param: PaneParam, signal?: AbortSignal) => Promise<Response>,
      options?: {
        requestTimeoutMs?: number;
      },
    ): Promise<CommandResponse> => {
      const param = buildPaneParam(paneId);
      return requestCommand(
        paneId,
        (signal) => request(param, signal),
        fallbackMessage,
        options?.requestTimeoutMs,
      );
    },
    [requestCommand],
  );

  const runPaneMutation = useCallback(
    (paneId: string, fallbackMessage: string, request: (param: PaneParam) => Promise<Response>) => {
      return mutateSession(paneId, request(buildPaneParam(paneId)), fallbackMessage);
    },
    [mutateSession],
  );

  const {
    sendText,
    launchAgentInSession,
    focusPane,
    killPane,
    killWindow,
    uploadImageAttachment,
    sendKeys,
    sendRaw,
    updateSessionTitle,
    touchSession,
    createRepoNote,
    updateRepoNote,
    deleteRepoNote,
  } = useMemo(
    () =>
      createSessionActionRequests({
        apiClient,
        runPaneCommand,
        runPaneMutation,
        requestPaneField: requestPaneQueryField,
        requestPaneNoteField,
        runLaunchCommand: (fallbackMessage, request, options) =>
          requestLaunchCommand(request, fallbackMessage, options?.requestTimeoutMs),
        ensureToken,
        onConnectionIssue,
        handleSessionMissing,
      }),
    [
      apiClient,
      ensureToken,
      handleSessionMissing,
      onConnectionIssue,
      requestLaunchCommand,
      runPaneCommand,
      runPaneMutation,
      requestPaneQueryField,
      requestPaneNoteField,
    ],
  );

  return useMemo(
    () => ({
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
      sendText,
      launchAgentInSession,
      focusPane,
      killPane,
      killWindow,
      uploadImageAttachment,
      sendKeys,
      sendRaw,
      updateSessionTitle,
      touchSession,
      createRepoNote,
      updateRepoNote,
      deleteRepoNote,
    }),
    [
      createRepoNote,
      deleteRepoNote,
      focusPane,
      killPane,
      killWindow,
      launchAgentInSession,
      refreshSessions,
      requestCommitDetail,
      requestCommitFile,
      requestCommitLog,
      requestDiffFile,
      requestDiffSummary,
      requestRepoFileContent,
      requestRepoFileSearch,
      requestRepoFileTree,
      requestRepoNotes,
      requestScreen,
      requestStateTimeline,
      requestWorktrees,
      sendKeys,
      sendRaw,
      sendText,
      touchSession,
      updateRepoNote,
      updateSessionTitle,
      uploadImageAttachment,
    ],
  );
};
