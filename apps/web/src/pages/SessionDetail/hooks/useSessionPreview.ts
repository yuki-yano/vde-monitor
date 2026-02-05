import type { ScreenResponse } from "@vde-monitor/shared";
import { useCallback } from "react";

import { API_ERROR_MESSAGES } from "@/lib/api-messages";

import { useScreenCache } from "./useScreenCache";

type UseSessionPreviewParams = {
  connected: boolean;
  connectionIssue: string | null;
  requestScreen: (
    paneId: string,
    options: { lines?: number; mode?: "text" | "image"; cursor?: string },
  ) => Promise<ScreenResponse>;
  lines?: number;
  ttlMs?: number;
};

export const useSessionPreview = ({
  connected,
  connectionIssue,
  requestScreen,
  lines = 240,
  ttlMs = 5000,
}: UseSessionPreviewParams) => {
  const { cache, loading, error, fetchScreen, clearCache } = useScreenCache({
    connected,
    connectionIssue,
    requestScreen,
    lines,
    ttlMs,
    cacheKey: "preview",
    errorMessages: {
      load: API_ERROR_MESSAGES.previewLoad,
      requestFailed: API_ERROR_MESSAGES.previewRequestFailed,
    },
  });
  const clearPreviewCache = useCallback(
    (paneId?: string) => {
      clearCache(paneId);
    },
    [clearCache],
  );
  const prefetchPreview = useCallback(
    async (paneId: string) => {
      await fetchScreen(paneId);
    },
    [fetchScreen],
  );

  return {
    previewCache: cache,
    previewLoading: loading,
    previewError: error,
    prefetchPreview,
    clearPreviewCache,
  };
};
