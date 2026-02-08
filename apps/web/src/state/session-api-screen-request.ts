import type { ApiEnvelope, ApiError, ScreenResponse } from "@vde-monitor/shared";

import { API_ERROR_MESSAGES } from "@/lib/api-messages";

import type { ApiClientContract } from "./session-api-contract";
import { requestScreenResponse as executeRequestScreenResponse } from "./session-api-request-executors";
import {
  buildPaneParam,
  buildScreenRequestJson,
  buildScreenRequestKeys,
  executeInflightRequest,
  resolveScreenMode,
} from "./session-api-utils";

type CreateSessionScreenRequestParams = {
  apiClient: ApiClientContract;
  screenInFlightMap: Map<string, Promise<ScreenResponse>>;
  ensureToken: () => void;
  onConnectionIssue: (message: string | null) => void;
  handleSessionMissing: (paneId: string, res: Response, data: ApiEnvelope<unknown> | null) => void;
  isPaneMissingError: (error?: ApiError | null) => boolean;
  onSessionRemoved: (paneId: string) => void;
  buildApiError: (code: ApiError["code"], message: string) => ApiError;
};

export const createSessionScreenRequest = ({
  apiClient,
  screenInFlightMap,
  ensureToken,
  onConnectionIssue,
  handleSessionMissing,
  isPaneMissingError,
  onSessionRemoved,
  buildApiError,
}: CreateSessionScreenRequestParams) => {
  return async (
    paneId: string,
    options: { lines?: number; mode?: "text" | "image"; cursor?: string },
  ): Promise<ScreenResponse> => {
    ensureToken();
    const normalizedMode = resolveScreenMode(options);
    const { requestKey, fallbackKey } = buildScreenRequestKeys({
      paneId,
      normalizedMode,
      lines: options.lines,
      cursor: options.cursor,
    });
    return executeInflightRequest({
      inFlightMap: screenInFlightMap,
      requestKey,
      fallbackKey,
      execute: () => {
        const param = buildPaneParam(paneId);
        const json = buildScreenRequestJson(options, normalizedMode);
        return executeRequestScreenResponse({
          paneId,
          mode: normalizedMode,
          request: apiClient.sessions[":paneId"].screen.$post({ param, json }),
          fallbackMessage: API_ERROR_MESSAGES.screenRequestFailed,
          onConnectionIssue,
          handleSessionMissing,
          isPaneMissingError,
          onSessionRemoved,
          buildApiError,
        });
      },
    });
  };
};
