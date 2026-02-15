import { useQueryClient } from "@tanstack/react-query";
import type { DiffFile, DiffSummary } from "@vde-monitor/shared";
import { useAtom } from "jotai";
import { useCallback, useEffect, useRef } from "react";

import { API_ERROR_MESSAGES } from "@/lib/api-messages";
import { useVisibilityPolling } from "@/lib/use-visibility-polling";
import { QUERY_GC_TIME_MS } from "@/state/query-client";

import {
  diffErrorAtom,
  diffFilesAtom,
  diffLoadingAtom,
  diffLoadingFilesAtom,
  diffOpenAtom,
  diffSummaryAtom,
} from "../atoms/diffAtoms";
import { AUTO_REFRESH_INTERVAL_MS, buildDiffSummarySignature } from "../sessionDetailUtils";

type UseSessionDiffsParams = {
  paneId: string;
  connected: boolean;
  worktreePath?: string | null;
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
};

const DIFF_FILE_QUERY_KEY = "session-diff-file";

const buildDiffFileQueryKey = ({
  paneId,
  worktreePath,
  rev,
  path,
}: {
  paneId: string;
  worktreePath: string | null;
  rev: string | null;
  path: string;
}) => [DIFF_FILE_QUERY_KEY, paneId, worktreePath ?? "__default__", rev ?? "unknown", path] as const;

export const useSessionDiffs = ({
  paneId,
  connected,
  worktreePath = null,
  requestDiffSummary,
  requestDiffFile,
}: UseSessionDiffsParams) => {
  const [diffSummary, setDiffSummary] = useAtom(diffSummaryAtom);
  const [diffError, setDiffError] = useAtom(diffErrorAtom);
  const [diffLoading, setDiffLoading] = useAtom(diffLoadingAtom);
  const [diffFiles, setDiffFiles] = useAtom(diffFilesAtom);
  const [diffOpen, setDiffOpen] = useAtom(diffOpenAtom);
  const [diffLoadingFiles, setDiffLoadingFiles] = useAtom(diffLoadingFilesAtom);

  const queryClient = useQueryClient();
  const diffOpenRef = useRef<Record<string, boolean>>({});
  const diffSignatureRef = useRef<string | null>(null);
  const prevConnectedRef = useRef<boolean | null>(null);
  const requestScopeKey = `${paneId}:${worktreePath ?? "__default__"}`;
  const activeScopeRef = useRef(requestScopeKey);
  const summaryRequestIdRef = useRef(0);
  activeScopeRef.current = requestScopeKey;

  const applyDiffSummary = useCallback(
    async (summary: DiffSummary, refreshOpenFiles: boolean) => {
      setDiffSummary(summary);
      const fileSet = new Set(summary.files.map((file) => file.path));
      setDiffOpen((prev) => {
        if (!summary.files.length) {
          return {};
        }
        const next: Record<string, boolean> = {};
        Object.entries(prev).forEach(([key, value]) => {
          if (fileSet.has(key)) {
            next[key] = value;
          }
        });
        return next;
      });
      const openTargets = Object.entries(diffOpenRef.current).filter(
        ([path, value]) => value && fileSet.has(path),
      );
      const cachedFiles = openTargets.reduce<Record<string, DiffFile>>((acc, [path]) => {
        const cached = queryClient.getQueryData<DiffFile>(
          buildDiffFileQueryKey({
            paneId,
            worktreePath,
            rev: summary.rev,
            path,
          }),
        );
        if (cached) {
          acc[path] = cached;
        }
        return acc;
      }, {});
      setDiffFiles(cachedFiles);
      if (openTargets.length > 0 && refreshOpenFiles) {
        await Promise.all(
          openTargets.map(async ([path]) => {
            const queryKey = buildDiffFileQueryKey({
              paneId,
              worktreePath,
              rev: summary.rev,
              path,
            });
            if (queryClient.getQueryData<DiffFile>(queryKey)) {
              return;
            }
            try {
              const file = await queryClient.fetchQuery({
                queryKey,
                queryFn: () =>
                  requestDiffFile(
                    paneId,
                    path,
                    summary.rev,
                    worktreePath ? { force: true, worktreePath } : { force: true },
                  ),
                gcTime: QUERY_GC_TIME_MS,
                retry: false,
              });
              setDiffFiles((prev) => ({ ...prev, [path]: file }));
            } catch (err) {
              setDiffError(err instanceof Error ? err.message : API_ERROR_MESSAGES.diffFile);
            }
          }),
        );
      }
    },
    [
      paneId,
      queryClient,
      requestDiffFile,
      setDiffError,
      setDiffFiles,
      setDiffOpen,
      setDiffSummary,
      worktreePath,
    ],
  );

  const loadDiffSummary = useCallback(async () => {
    if (!paneId) return;
    const targetScopeKey = requestScopeKey;
    const requestId = summaryRequestIdRef.current + 1;
    summaryRequestIdRef.current = requestId;
    setDiffLoading(true);
    setDiffError(null);
    try {
      const summary = await requestDiffSummary(
        paneId,
        worktreePath ? { force: true, worktreePath } : { force: true },
      );
      if (summaryRequestIdRef.current !== requestId || activeScopeRef.current !== targetScopeKey) {
        return;
      }
      await applyDiffSummary(summary, true);
    } catch (err) {
      if (summaryRequestIdRef.current !== requestId || activeScopeRef.current !== targetScopeKey) {
        return;
      }
      setDiffError(err instanceof Error ? err.message : API_ERROR_MESSAGES.diffSummary);
    } finally {
      if (summaryRequestIdRef.current === requestId && activeScopeRef.current === targetScopeKey) {
        setDiffLoading(false);
      }
    }
  }, [
    applyDiffSummary,
    paneId,
    requestDiffSummary,
    requestScopeKey,
    setDiffError,
    setDiffLoading,
    worktreePath,
  ]);

  const pollDiffSummary = useCallback(async () => {
    if (!paneId) return;
    const targetScopeKey = requestScopeKey;
    const requestId = summaryRequestIdRef.current + 1;
    summaryRequestIdRef.current = requestId;
    try {
      const summary = await requestDiffSummary(
        paneId,
        worktreePath ? { force: true, worktreePath } : { force: true },
      );
      if (summaryRequestIdRef.current !== requestId || activeScopeRef.current !== targetScopeKey) {
        return;
      }
      const signature = buildDiffSummarySignature(summary);
      if (signature === diffSignatureRef.current) {
        return;
      }
      setDiffError(null);
      await applyDiffSummary(summary, true);
    } catch {
      return;
    }
  }, [applyDiffSummary, paneId, requestDiffSummary, requestScopeKey, setDiffError, worktreePath]);
  const pollDiffSummaryTick = useCallback(() => {
    void pollDiffSummary();
  }, [pollDiffSummary]);

  const loadDiffFile = useCallback(
    async (path: string) => {
      if (!paneId || !diffSummary?.rev) return;
      if (diffLoadingFiles[path]) return;
      const queryKey = buildDiffFileQueryKey({
        paneId,
        worktreePath,
        rev: diffSummary.rev,
        path,
      });
      const cached = queryClient.getQueryData<DiffFile>(queryKey);
      if (cached) {
        setDiffFiles((prev) => ({ ...prev, [path]: cached }));
        return;
      }
      const targetScopeKey = requestScopeKey;
      const requestId = summaryRequestIdRef.current;
      setDiffLoadingFiles((prev) => ({ ...prev, [path]: true }));
      try {
        const file = await queryClient.fetchQuery({
          queryKey,
          queryFn: () =>
            requestDiffFile(
              paneId,
              path,
              diffSummary.rev,
              worktreePath ? { force: true, worktreePath } : { force: true },
            ),
          gcTime: QUERY_GC_TIME_MS,
          retry: false,
        });
        if (
          summaryRequestIdRef.current !== requestId ||
          activeScopeRef.current !== targetScopeKey
        ) {
          return;
        }
        setDiffFiles((prev) => ({ ...prev, [path]: file }));
      } catch (err) {
        if (
          summaryRequestIdRef.current !== requestId ||
          activeScopeRef.current !== targetScopeKey
        ) {
          return;
        }
        setDiffError(err instanceof Error ? err.message : API_ERROR_MESSAGES.diffFile);
      } finally {
        if (
          summaryRequestIdRef.current === requestId &&
          activeScopeRef.current === targetScopeKey
        ) {
          setDiffLoadingFiles((prev) => ({ ...prev, [path]: false }));
        }
      }
    },
    [
      diffLoadingFiles,
      diffSummary?.rev,
      paneId,
      queryClient,
      requestScopeKey,
      requestDiffFile,
      setDiffError,
      setDiffFiles,
      setDiffLoadingFiles,
      worktreePath,
    ],
  );

  const toggleDiff = useCallback(
    (path: string) => {
      setDiffOpen((prev) => {
        const nextOpen = !prev[path];
        if (nextOpen) {
          void loadDiffFile(path);
        }
        return { ...prev, [path]: nextOpen };
      });
    },
    [loadDiffFile, setDiffOpen],
  );

  useEffect(() => {
    loadDiffSummary();
  }, [loadDiffSummary]);

  useEffect(() => {
    if (prevConnectedRef.current === false && connected) {
      void loadDiffSummary();
    }
    prevConnectedRef.current = connected;
  }, [connected, loadDiffSummary]);

  useVisibilityPolling({
    enabled: Boolean(paneId) && connected,
    intervalMs: AUTO_REFRESH_INTERVAL_MS,
    onTick: pollDiffSummaryTick,
  });

  useEffect(() => {
    setDiffSummary(null);
    setDiffFiles({});
    setDiffOpen({});
    setDiffError(null);
    diffSignatureRef.current = null;
    return () => {
      queryClient.removeQueries({
        queryKey: [DIFF_FILE_QUERY_KEY, paneId, worktreePath ?? "__default__"],
      });
    };
  }, [paneId, queryClient, setDiffError, setDiffFiles, setDiffOpen, setDiffSummary, worktreePath]);

  useEffect(() => {
    diffOpenRef.current = diffOpen;
  }, [diffOpen]);

  useEffect(() => {
    diffSignatureRef.current = diffSummary ? buildDiffSummarySignature(diffSummary) : null;
  }, [diffSummary]);

  return {
    diffSummary,
    diffError,
    diffLoading,
    diffFiles,
    diffOpen,
    diffLoadingFiles,
    refreshDiff: loadDiffSummary,
    toggleDiff,
    ensureDiffFile: loadDiffFile,
  };
};
