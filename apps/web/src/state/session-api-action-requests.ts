import type {
  AllowedKey,
  ApiEnvelope,
  CommandResponse,
  ImageAttachment,
  LaunchCommandResponse,
  RawItem,
  RepoNote,
} from "@vde-monitor/shared";

import { API_ERROR_MESSAGES } from "@/lib/api-messages";

import type { LaunchAgentRequestOptions } from "./launch-agent-options";
import type { ApiClientContract, NoteIdParam, PaneParam } from "./session-api-contract";
import { requestImageAttachment as executeRequestImageAttachment } from "./session-api-request-executors";
import {
  buildLaunchAgentJson,
  buildPaneParam,
  buildRepoNotePayloadJson,
  buildSendKeysJson,
  buildSendRawJson,
  buildSendTextJson,
  buildSessionTitleJson,
  buildUploadImageForm,
} from "./session-api-utils";

type RunPaneCommand = (
  paneId: string,
  fallbackMessage: string,
  request: (param: PaneParam, signal?: AbortSignal) => Promise<Response>,
  options?: {
    requestTimeoutMs?: number;
  },
) => Promise<CommandResponse>;

type RunPaneMutation = (
  paneId: string,
  fallbackMessage: string,
  request: (param: PaneParam) => Promise<Response>,
) => Promise<unknown>;

type RequestPaneField = <T, K extends keyof T>(params: {
  paneId: string;
  request: (param: PaneParam) => Promise<Response>;
  field: K;
  fallbackMessage: string;
}) => Promise<NonNullable<T[K]>>;

type RequestPaneNoteField = <T, K extends keyof T>(params: {
  paneId: string;
  noteId: string;
  request: (param: NoteIdParam) => Promise<Response>;
  field: K;
  fallbackMessage: string;
}) => Promise<NonNullable<T[K]>>;

type RunLaunchCommand = (
  fallbackMessage: string,
  request: (signal?: AbortSignal) => Promise<Response>,
  options?: {
    requestTimeoutMs?: number;
  },
) => Promise<LaunchCommandResponse>;

type CreateSessionActionRequestsParams = {
  apiClient: ApiClientContract;
  runPaneCommand: RunPaneCommand;
  runPaneMutation: RunPaneMutation;
  requestPaneField: RequestPaneField;
  requestPaneNoteField: RequestPaneNoteField;
  runLaunchCommand: RunLaunchCommand;
  ensureToken: () => void;
  onConnectionIssue: (message: string | null) => void;
  handleSessionMissing: (paneId: string, res: Response, data: ApiEnvelope<unknown> | null) => void;
};

export const createSessionActionRequests = ({
  apiClient,
  runPaneCommand,
  runPaneMutation,
  requestPaneField,
  requestPaneNoteField,
  runLaunchCommand,
  ensureToken,
  onConnectionIssue,
  handleSessionMissing,
}: CreateSessionActionRequestsParams) => {
  const SEND_TEXT_REQUEST_TIMEOUT_MS = 10000;
  const LAUNCH_AGENT_REQUEST_TIMEOUT_MS = 10_000;

  const sendText = async (
    paneId: string,
    text: string,
    enter = true,
    requestId?: string,
  ): Promise<CommandResponse> => {
    return runPaneCommand(
      paneId,
      API_ERROR_MESSAGES.sendText,
      (param, signal) =>
        apiClient.sessions[":paneId"].send.text.$post(
          {
            param,
            json: buildSendTextJson(text, enter, requestId),
          },
          { init: { signal } },
        ),
      { requestTimeoutMs: SEND_TEXT_REQUEST_TIMEOUT_MS },
    );
  };

  const focusPane = async (paneId: string): Promise<CommandResponse> => {
    return runPaneCommand(paneId, API_ERROR_MESSAGES.focusPane, (param, signal) =>
      apiClient.sessions[":paneId"].focus.$post({ param }, { init: { signal } }),
    );
  };

  const killPane = async (paneId: string): Promise<CommandResponse> => {
    return runPaneCommand(paneId, API_ERROR_MESSAGES.killPane, (param, signal) =>
      apiClient.sessions[":paneId"].kill.pane.$post({ param }, { init: { signal } }),
    );
  };

  const killWindow = async (paneId: string): Promise<CommandResponse> => {
    return runPaneCommand(paneId, API_ERROR_MESSAGES.killWindow, (param, signal) =>
      apiClient.sessions[":paneId"].kill.window.$post({ param }, { init: { signal } }),
    );
  };

  const launchAgentInSession = async (
    sessionName: string,
    agent: "codex" | "claude",
    requestId: string,
    options?: LaunchAgentRequestOptions,
  ): Promise<LaunchCommandResponse> => {
    return runLaunchCommand(
      API_ERROR_MESSAGES.launchAgent,
      (signal) =>
        apiClient.sessions.launch.$post(
          {
            json: buildLaunchAgentJson({
              sessionName,
              agent,
              requestId,
              windowName: options?.windowName,
              cwd: options?.cwd,
              agentOptions: options?.agentOptions,
              worktreePath: options?.worktreePath,
              worktreeBranch: options?.worktreeBranch,
              worktreeCreateIfMissing: options?.worktreeCreateIfMissing,
            }),
          },
          { init: { signal } },
        ),
      { requestTimeoutMs: LAUNCH_AGENT_REQUEST_TIMEOUT_MS },
    );
  };

  const uploadImageAttachment = async (paneId: string, file: File): Promise<ImageAttachment> => {
    return executeRequestImageAttachment({
      paneId,
      request: apiClient.sessions[":paneId"].attachments.image.$post({
        param: buildPaneParam(paneId),
        form: buildUploadImageForm(file),
      }),
      ensureToken,
      onConnectionIssue,
      handleSessionMissing,
    });
  };

  const sendKeys = async (paneId: string, keys: AllowedKey[]): Promise<CommandResponse> => {
    return runPaneCommand(paneId, API_ERROR_MESSAGES.sendKeys, (param, signal) =>
      apiClient.sessions[":paneId"].send.keys.$post(
        {
          param,
          json: buildSendKeysJson(keys),
        },
        { init: { signal } },
      ),
    );
  };

  const sendRaw = async (
    paneId: string,
    items: RawItem[],
    unsafe = false,
  ): Promise<CommandResponse> => {
    return runPaneCommand(paneId, API_ERROR_MESSAGES.sendRaw, (param, signal) =>
      apiClient.sessions[":paneId"].send.raw.$post(
        {
          param,
          json: buildSendRawJson(items, unsafe),
        },
        { init: { signal } },
      ),
    );
  };

  const updateSessionTitle = async (paneId: string, title: string | null) => {
    await runPaneMutation(paneId, API_ERROR_MESSAGES.updateTitle, (param) =>
      apiClient.sessions[":paneId"].title.$put({
        param,
        json: buildSessionTitleJson(title),
      }),
    );
  };

  const touchSession = async (paneId: string) => {
    await runPaneMutation(paneId, API_ERROR_MESSAGES.updateActivity, (param) =>
      apiClient.sessions[":paneId"].touch.$post({ param }),
    );
  };

  const createRepoNote = async (
    paneId: string,
    input: { title?: string | null; body: string },
  ): Promise<RepoNote> =>
    requestPaneField<{ note?: RepoNote }, "note">({
      paneId,
      request: (param) =>
        apiClient.sessions[":paneId"].notes.$post({
          param,
          json: buildRepoNotePayloadJson(input.title, input.body),
        }),
      field: "note",
      fallbackMessage: API_ERROR_MESSAGES.createRepoNote,
    });

  const updateRepoNote = async (
    paneId: string,
    noteId: string,
    input: { title?: string | null; body: string },
  ): Promise<RepoNote> =>
    requestPaneNoteField<{ note?: RepoNote }, "note">({
      paneId,
      noteId,
      request: (param) =>
        apiClient.sessions[":paneId"].notes[":noteId"].$put({
          param,
          json: buildRepoNotePayloadJson(input.title, input.body),
        }),
      field: "note",
      fallbackMessage: API_ERROR_MESSAGES.updateRepoNote,
    });

  const deleteRepoNote = async (paneId: string, noteId: string): Promise<string> =>
    requestPaneNoteField<{ noteId?: string }, "noteId">({
      paneId,
      noteId,
      request: (param) => apiClient.sessions[":paneId"].notes[":noteId"].$delete({ param }),
      field: "noteId",
      fallbackMessage: API_ERROR_MESSAGES.deleteRepoNote,
    });

  return {
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
  };
};
