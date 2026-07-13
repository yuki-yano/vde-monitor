import type { DiffFile, DiffSummary } from "@vde-monitor/shared";
import { useAtom } from "jotai";
import { useCallback, useEffect, useMemo, useRef } from "react";

import { API_ERROR_MESSAGES } from "@/lib/api-messages";
import { resolveUnknownErrorMessage } from "@/lib/api-utils";

import {
  diffErrorAtom,
  diffFilesAtom,
  diffLoadingAtom,
  diffLoadingFilesAtom,
  diffOpenAtom,
  diffSummaryAtom,
} from "../atoms/diffAtoms";
import { AUTO_REFRESH_INTERVAL_MS, buildDiffSummarySnapshot } from "../sessionDetailUtils";
import { isCurrentScopedRequest, runScopedRequest } from "./session-request-guard";
import { useScopeGuard } from "./useScopeGuard";

type UseSessionDiffsParams = {
  paneId: string;
  connected: boolean;
  worktreePath?: string | null;
  branch?: string | null;
  requestDiffSummary: (
    paneId: string,
    options?: { force?: boolean; worktreePath?: string; branch?: string },
  ) => Promise<DiffSummary>;
  requestDiffFile: (
    paneId: string,
    path: string,
    rev?: string | null,
    options?: { force?: boolean; worktreePath?: string; branch?: string },
  ) => Promise<DiffFile>;
};

// ---------------------------------------------------------------------------
// Module-level diff file cache (replaces TanStack Query cache)
// Key: `${paneId}\x00${worktreePath|__default__}:${branch|__no_branch__}\x00${rev|unknown}\x00${path}`
// ---------------------------------------------------------------------------

const diffFileCache = new Map<string, DiffFile>();

const buildDiffFileCacheKey = (
  paneId: string,
  worktreePath: string | null,
  branch: string | null,
  rev: string | null,
  path: string,
) =>
  `${paneId}\x00${worktreePath ?? "__default__"}:${branch ?? "__no_branch__"}\x00${rev ?? "unknown"}\x00${path}`;

const buildDiffFileCacheKeyPrefix = (
  paneId: string,
  worktreePath: string | null,
  branch: string | null,
) => `${paneId}\x00${worktreePath ?? "__default__"}:${branch ?? "__no_branch__"}\x00`;

const getDiffFileFromCache = (
  paneId: string,
  worktreePath: string | null,
  branch: string | null,
  rev: string | null,
  path: string,
): DiffFile | undefined =>
  diffFileCache.get(buildDiffFileCacheKey(paneId, worktreePath, branch, rev, path));

const setDiffFileInCache = (
  paneId: string,
  worktreePath: string | null,
  branch: string | null,
  rev: string | null,
  path: string,
  file: DiffFile,
) => diffFileCache.set(buildDiffFileCacheKey(paneId, worktreePath, branch, rev, path), file);

const clearDiffFileCacheForPane = (
  paneId: string,
  worktreePath: string | null,
  branch: string | null,
) => {
  const prefix = buildDiffFileCacheKeyPrefix(paneId, worktreePath, branch);
  for (const key of diffFileCache.keys()) {
    if (key.startsWith(prefix)) {
      diffFileCache.delete(key);
    }
  }
};

// Entries for stale revs are never read again (lookups always use the current
// summary rev), so drop them when the rev advances to keep the cache bounded.
const pruneDiffFileCacheToRev = (
  paneId: string,
  worktreePath: string | null,
  branch: string | null,
  rev: string | null,
) => {
  const prefix = buildDiffFileCacheKeyPrefix(paneId, worktreePath, branch);
  const keepPrefix = `${prefix}${rev ?? "unknown"}\x00`;
  for (const key of diffFileCache.keys()) {
    if (key.startsWith(prefix) && !key.startsWith(keepPrefix)) {
      diffFileCache.delete(key);
    }
  }
};

// Fetch from cache or call the query function and store the result
const fetchDiffFileWithCache = async (
  paneId: string,
  worktreePath: string | null,
  branch: string | null,
  rev: string | null,
  path: string,
  queryFn: () => Promise<DiffFile>,
): Promise<DiffFile> => {
  const cached = getDiffFileFromCache(paneId, worktreePath, branch, rev, path);
  if (cached) {
    return cached;
  }
  const file = await queryFn();
  setDiffFileInCache(paneId, worktreePath, branch, rev, path, file);
  return file;
};

export const useSessionDiffs = ({
  paneId,
  connected,
  worktreePath = null,
  branch = null,
  requestDiffSummary,
  requestDiffFile,
}: UseSessionDiffsParams) => {
  const [diffSummary, setDiffSummary] = useAtom(diffSummaryAtom);
  const [diffError, setDiffError] = useAtom(diffErrorAtom);
  const [diffLoading, setDiffLoading] = useAtom(diffLoadingAtom);
  const [diffFiles, setDiffFiles] = useAtom(diffFilesAtom);
  const [diffOpen, setDiffOpen] = useAtom(diffOpenAtom);
  const [diffLoadingFiles, setDiffLoadingFiles] = useAtom(diffLoadingFilesAtom);

  const diffOpenRef = useRef<Record<string, boolean>>({});
  const diffSnapshotRef = useRef<string | null>(null);
  const onReconnectRef = useRef<() => void>(() => {});
  const pollTickRef = useRef<() => void>(() => {});
  const { scopeKey: requestScopeKey, activeScopeRef } = useScopeGuard({
    paneId,
    worktreePath,
    branch,
    connected,
    onReconnectRef,
    pollTickRef,
    pollIntervalMs: AUTO_REFRESH_INTERVAL_MS,
  });
  const summaryRequestIdRef = useRef(0);

  const requestOptions = useMemo(
    () =>
      branch
        ? ({ force: true, branch } as const)
        : worktreePath
          ? ({ force: true, worktreePath } as const)
          : ({ force: true } as const),
    [branch, worktreePath],
  );

  const applyDiffSummary = useCallback(
    async (summary: DiffSummary, refreshOpenFiles: boolean, isCurrent: () => boolean) => {
      pruneDiffFileCacheToRev(paneId, worktreePath, branch, summary.rev);
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
        const cached = getDiffFileFromCache(paneId, worktreePath, branch, summary.rev, path);
        if (cached) {
          acc[path] = cached;
        }
        return acc;
      }, {});
      setDiffFiles(cachedFiles);
      if (openTargets.length > 0 && refreshOpenFiles) {
        await Promise.all(
          openTargets.map(async ([path]) => {
            if (getDiffFileFromCache(paneId, worktreePath, branch, summary.rev, path)) {
              return;
            }
            try {
              const file = await fetchDiffFileWithCache(
                paneId,
                worktreePath,
                branch,
                summary.rev,
                path,
                () => requestDiffFile(paneId, path, summary.rev, requestOptions),
              );
              if (!isCurrent()) {
                return;
              }
              setDiffFiles((prev) => ({ ...prev, [path]: file }));
            } catch (err) {
              if (!isCurrent()) {
                return;
              }
              setDiffError(resolveUnknownErrorMessage(err, API_ERROR_MESSAGES.diffFile));
            }
          }),
        );
      }
    },
    [
      branch,
      paneId,
      requestDiffFile,
      requestOptions,
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
    setDiffLoading(true);
    setDiffError(null);
    await runScopedRequest({
      requestIdRef: summaryRequestIdRef,
      activeScopeRef,
      scopeKey: targetScopeKey,
      run: () => requestDiffSummary(paneId, requestOptions),
      onSuccess: async (summary, { isCurrent }) => {
        await applyDiffSummary(summary, true, isCurrent);
      },
      onError: (err) => {
        setDiffError(resolveUnknownErrorMessage(err, API_ERROR_MESSAGES.diffSummary));
      },
      onSettled: ({ isCurrent }) => {
        if (isCurrent()) {
          setDiffLoading(false);
        }
      },
    });
  }, [
    activeScopeRef,
    applyDiffSummary,
    paneId,
    requestDiffSummary,
    requestOptions,
    requestScopeKey,
    setDiffError,
    setDiffLoading,
  ]);

  const pollDiffSummary = useCallback(async () => {
    if (!paneId) return;
    const targetScopeKey = requestScopeKey;
    await runScopedRequest({
      requestIdRef: summaryRequestIdRef,
      activeScopeRef,
      scopeKey: targetScopeKey,
      run: () => requestDiffSummary(paneId, requestOptions),
      onSuccess: async (summary, { isCurrent }) => {
        const snapshot = buildDiffSummarySnapshot(summary);
        if (snapshot === diffSnapshotRef.current) {
          return;
        }
        setDiffError(null);
        await applyDiffSummary(summary, true, isCurrent);
      },
    });
  }, [
    activeScopeRef,
    applyDiffSummary,
    paneId,
    requestDiffSummary,
    requestOptions,
    requestScopeKey,
    setDiffError,
  ]);
  const pollDiffSummaryTick = useCallback(() => {
    void pollDiffSummary();
  }, [pollDiffSummary]);

  // Keep scope-guard callback refs up to date before effects run.
  onReconnectRef.current = () => {
    void loadDiffSummary();
  };
  pollTickRef.current = pollDiffSummaryTick;

  const loadDiffFile = useCallback(
    async (path: string) => {
      if (!paneId || !diffSummary?.rev) return;
      if (diffLoadingFiles[path]) return;
      const cached = getDiffFileFromCache(paneId, worktreePath, branch, diffSummary.rev, path);
      if (cached) {
        setDiffFiles((prev) => ({ ...prev, [path]: cached }));
        return;
      }
      const targetScopeKey = requestScopeKey;
      const requestId = summaryRequestIdRef.current;
      setDiffLoadingFiles((prev) => ({ ...prev, [path]: true }));
      try {
        // False positive: the scope/request guard depends on the resolved file.
        // react-doctor-disable-next-line async-defer-await
        const file = await fetchDiffFileWithCache(
          paneId,
          worktreePath,
          branch,
          diffSummary.rev,
          path,
          () => requestDiffFile(paneId, path, diffSummary.rev, requestOptions),
        );
        if (
          !isCurrentScopedRequest({
            requestIdRef: summaryRequestIdRef,
            requestId,
            activeScopeRef,
            scopeKey: targetScopeKey,
          })
        ) {
          return;
        }
        setDiffFiles((prev) => ({ ...prev, [path]: file }));
      } catch (err) {
        if (
          !isCurrentScopedRequest({
            requestIdRef: summaryRequestIdRef,
            requestId,
            activeScopeRef,
            scopeKey: targetScopeKey,
          })
        ) {
          return;
        }
        setDiffError(resolveUnknownErrorMessage(err, API_ERROR_MESSAGES.diffFile));
      } finally {
        if (
          isCurrentScopedRequest({
            requestIdRef: summaryRequestIdRef,
            requestId,
            activeScopeRef,
            scopeKey: targetScopeKey,
          })
        ) {
          setDiffLoadingFiles((prev) => ({ ...prev, [path]: false }));
        }
      }
    },
    [
      activeScopeRef,
      branch,
      diffLoadingFiles,
      diffSummary?.rev,
      paneId,
      requestScopeKey,
      requestDiffFile,
      requestOptions,
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

  // False positive: diff summary loading is lifecycle IO keyed by pane/worktree,
  // and moving it to render or a user event would skip the initial load.
  useEffect(() => {
    // react-doctor-disable-next-line no-pass-data-to-parent
    loadDiffSummary();
  }, [loadDiffSummary]);

  useEffect(() => {
    setDiffSummary(null);
    setDiffFiles({});
    setDiffOpen({});
    setDiffError(null);
    diffSnapshotRef.current = null;
    return () => {
      clearDiffFileCacheForPane(paneId, worktreePath, branch);
    };
  }, [branch, paneId, setDiffError, setDiffFiles, setDiffOpen, setDiffSummary, worktreePath]);

  useEffect(() => {
    diffOpenRef.current = diffOpen;
  }, [diffOpen]);

  useEffect(() => {
    diffSnapshotRef.current = diffSummary ? buildDiffSummarySnapshot(diffSummary) : null;
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
