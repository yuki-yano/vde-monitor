import type {
  AllowedKey,
  ApiEnvelope,
  CommandResponse,
  ImageAttachment,
  RawItem,
} from "@vde-monitor/shared";

import { API_ERROR_MESSAGES } from "@/lib/api-messages";

import type { ApiClientContract, PaneParam } from "./session-api-contract";
import { requestImageAttachment as executeRequestImageAttachment } from "./session-api-request-executors";
import {
  buildPaneParam,
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
) => Promise<CommandResponse>;

type RunPaneMutation = (
  paneId: string,
  fallbackMessage: string,
  request: (param: PaneParam) => Promise<Response>,
) => Promise<unknown>;

type CreateSessionActionRequestsParams = {
  apiClient: ApiClientContract;
  runPaneCommand: RunPaneCommand;
  runPaneMutation: RunPaneMutation;
  ensureToken: () => void;
  onConnectionIssue: (message: string | null) => void;
  handleSessionMissing: (paneId: string, res: Response, data: ApiEnvelope<unknown> | null) => void;
};

export const createSessionActionRequests = ({
  apiClient,
  runPaneCommand,
  runPaneMutation,
  ensureToken,
  onConnectionIssue,
  handleSessionMissing,
}: CreateSessionActionRequestsParams) => {
  const sendText = async (
    paneId: string,
    text: string,
    enter = true,
    requestId?: string,
  ): Promise<CommandResponse> => {
    return runPaneCommand(paneId, API_ERROR_MESSAGES.sendText, (param, signal) =>
      apiClient.sessions[":paneId"].send.text.$post(
        {
          param,
          json: buildSendTextJson(text, enter, requestId),
        },
        { init: { signal } },
      ),
    );
  };

  const focusPane = async (paneId: string): Promise<CommandResponse> => {
    return runPaneCommand(paneId, API_ERROR_MESSAGES.focusPane, (param, signal) =>
      apiClient.sessions[":paneId"].focus.$post({ param }, { init: { signal } }),
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

  return {
    sendText,
    focusPane,
    uploadImageAttachment,
    sendKeys,
    sendRaw,
    updateSessionTitle,
    touchSession,
  };
};
