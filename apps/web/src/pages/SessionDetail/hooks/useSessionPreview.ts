import type { ScreenResponse } from "@vde-monitor/shared";
import { useCallback, useEffect, useRef, useState } from "react";

import { DISCONNECTED_MESSAGE } from "../sessionDetailUtils";

type PreviewCacheEntry = {
  screen: string;
  capturedAt: string;
  updatedAt: number;
  truncated?: boolean | null;
};

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
  const [previewCache, setPreviewCache] = useState<Record<string, PreviewCacheEntry>>({});
  const [previewLoading, setPreviewLoading] = useState<Record<string, boolean>>({});
  const [previewError, setPreviewError] = useState<Record<string, string | null>>({});

  const cacheRef = useRef<Record<string, PreviewCacheEntry>>({});
  const inflightRef = useRef(new Set<string>());
  const requestIdRef = useRef(0);
  const latestRequestRef = useRef<Record<string, number>>({});

  useEffect(() => {
    cacheRef.current = previewCache;
  }, [previewCache]);

  const prefetchPreview = useCallback(
    async (paneId: string) => {
      if (!paneId) return;
      if (!connected) {
        setPreviewError((prev) => ({
          ...prev,
          [paneId]: connectionIssue ?? DISCONNECTED_MESSAGE,
        }));
        return;
      }
      if (inflightRef.current.has(paneId)) {
        return;
      }
      const cached = cacheRef.current[paneId];
      if (cached && Date.now() - cached.updatedAt < ttlMs) {
        return;
      }
      inflightRef.current.add(paneId);
      const requestId = (requestIdRef.current += 1);
      latestRequestRef.current[paneId] = requestId;
      setPreviewLoading((prev) => ({ ...prev, [paneId]: true }));
      setPreviewError((prev) => ({ ...prev, [paneId]: null }));
      try {
        const response = await requestScreen(paneId, { mode: "text", lines });
        if (latestRequestRef.current[paneId] !== requestId) {
          return;
        }
        if (!response.ok) {
          setPreviewError((prev) => ({
            ...prev,
            [paneId]: response.error?.message ?? "Failed to load preview",
          }));
          return;
        }
        setPreviewCache((prev) => ({
          ...prev,
          [paneId]: {
            screen: response.screen ?? "",
            capturedAt: response.capturedAt,
            truncated: response.truncated ?? null,
            updatedAt: Date.now(),
          },
        }));
      } catch (err) {
        if (latestRequestRef.current[paneId] !== requestId) {
          return;
        }
        setPreviewError((prev) => ({
          ...prev,
          [paneId]: err instanceof Error ? err.message : "Preview request failed",
        }));
      } finally {
        inflightRef.current.delete(paneId);
        if (latestRequestRef.current[paneId] === requestId) {
          setPreviewLoading((prev) => ({ ...prev, [paneId]: false }));
        }
      }
    },
    [connected, connectionIssue, lines, requestScreen, ttlMs],
  );

  return {
    previewCache,
    previewLoading,
    previewError,
    prefetchPreview,
  };
};
