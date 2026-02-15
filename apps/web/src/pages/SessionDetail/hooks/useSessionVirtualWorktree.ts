import type { SessionSummary, WorktreeList, WorktreeListEntry } from "@vde-monitor/shared";
import { useCallback, useEffect, useMemo, useState } from "react";

const VIRTUAL_WORKTREE_STORAGE_KEY_PREFIX = "vde-monitor:virtual-worktree:v1";

type StoredVirtualWorktreeSelection = {
  repoRoot: string | null;
  worktreePath: string;
  branch: string | null;
  updatedAt: string;
};

type UseSessionVirtualWorktreeArgs = {
  paneId: string;
  session: SessionSummary | null;
  requestWorktrees: (paneId: string) => Promise<WorktreeList>;
};

const normalizePath = (value: string | null | undefined) => {
  if (!value) {
    return null;
  }
  const normalized = value.replace(/[\\/]+$/, "");
  if (normalized.length > 0) {
    return normalized;
  }
  return "/";
};

const buildStorageKey = (paneId: string) => `${VIRTUAL_WORKTREE_STORAGE_KEY_PREFIX}:${paneId}`;

const readStoredSelection = (paneId: string): StoredVirtualWorktreeSelection | null => {
  if (typeof window === "undefined") {
    return null;
  }
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(buildStorageKey(paneId));
  } catch {
    return null;
  }
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<StoredVirtualWorktreeSelection>;
    if (
      typeof parsed.worktreePath !== "string" ||
      (parsed.repoRoot != null && typeof parsed.repoRoot !== "string") ||
      (parsed.branch != null && typeof parsed.branch !== "string")
    ) {
      return null;
    }
    return {
      repoRoot: parsed.repoRoot ?? null,
      worktreePath: parsed.worktreePath,
      branch: parsed.branch ?? null,
      updatedAt: parsed.updatedAt ?? "",
    };
  } catch {
    return null;
  }
};

const clearStoredSelection = (paneId: string) => {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.removeItem(buildStorageKey(paneId));
  } catch {
    return;
  }
};

const writeStoredSelection = (paneId: string, value: StoredVirtualWorktreeSelection) => {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(buildStorageKey(paneId), JSON.stringify(value));
  } catch {
    return;
  }
};

export const useSessionVirtualWorktree = ({
  paneId,
  session,
  requestWorktrees,
}: UseSessionVirtualWorktreeArgs) => {
  const [worktreeList, setWorktreeList] = useState<WorktreeList | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [virtualWorktreePath, setVirtualWorktreePath] = useState<string | null>(null);

  const actualWorktreePath = useMemo(
    () => normalizePath(session?.worktreePath ?? null),
    [session?.worktreePath],
  );
  const actualBranch = session?.branch ?? null;

  useEffect(() => {
    setWorktreeList(null);
    setVirtualWorktreePath(null);
    setError(null);
    setLoading(false);
  }, [paneId]);

  useEffect(() => {
    let cancelled = false;
    setWorktreeList(null);
    setLoading(true);
    setError(null);
    void requestWorktrees(paneId)
      .then((next) => {
        if (cancelled) {
          return;
        }
        setWorktreeList(next);
      })
      .catch((nextError) => {
        if (cancelled) {
          return;
        }
        setWorktreeList(null);
        setError(nextError instanceof Error ? nextError.message : "Failed to load worktrees");
      })
      .finally(() => {
        if (cancelled) {
          return;
        }
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [paneId, requestWorktrees, session?.repoRoot]);

  const entries = useMemo(() => worktreeList?.entries ?? [], [worktreeList]);
  const normalizedRepoRoot = normalizePath(worktreeList?.repoRoot ?? null);
  const baseBranch = worktreeList?.baseBranch ?? null;
  const pathSet = useMemo(() => new Set(entries.map((entry) => entry.path)), [entries]);

  useEffect(() => {
    if (!worktreeList || !normalizedRepoRoot) {
      return;
    }
    const stored = readStoredSelection(paneId);
    if (!stored) {
      return;
    }
    const normalizedStoredPath = normalizePath(stored.worktreePath);
    if (!normalizedStoredPath) {
      clearStoredSelection(paneId);
      return;
    }
    if (stored.repoRoot && normalizePath(stored.repoRoot) !== normalizedRepoRoot) {
      clearStoredSelection(paneId);
      return;
    }
    if (normalizedStoredPath === actualWorktreePath) {
      clearStoredSelection(paneId);
      return;
    }
    if (!pathSet.has(normalizedStoredPath)) {
      if (entries.length > 0) {
        clearStoredSelection(paneId);
      }
      return;
    }
    setVirtualWorktreePath((prev) => (prev === normalizedStoredPath ? prev : normalizedStoredPath));
  }, [actualWorktreePath, entries.length, normalizedRepoRoot, paneId, pathSet, worktreeList]);

  useEffect(() => {
    if (!virtualWorktreePath) {
      return;
    }
    if (virtualWorktreePath === actualWorktreePath) {
      clearStoredSelection(paneId);
      setVirtualWorktreePath(null);
      return;
    }
    if (pathSet.size > 0 && !pathSet.has(virtualWorktreePath)) {
      clearStoredSelection(paneId);
      setVirtualWorktreePath(null);
    }
  }, [actualWorktreePath, paneId, pathSet, virtualWorktreePath]);

  const selectedVirtualEntry = useMemo(
    () => entries.find((entry) => entry.path === virtualWorktreePath) ?? null,
    [entries, virtualWorktreePath],
  );

  useEffect(() => {
    if (!selectedVirtualEntry || !normalizedRepoRoot) {
      return;
    }
    writeStoredSelection(paneId, {
      repoRoot: normalizedRepoRoot,
      worktreePath: selectedVirtualEntry.path,
      branch: selectedVirtualEntry.branch,
      updatedAt: new Date().toISOString(),
    });
  }, [normalizedRepoRoot, paneId, selectedVirtualEntry]);

  const selectVirtualWorktree = useCallback(
    (nextPath: string) => {
      const normalizedNextPath = normalizePath(nextPath);
      if (!normalizedNextPath) {
        return;
      }
      if (normalizedNextPath === actualWorktreePath) {
        clearStoredSelection(paneId);
        setVirtualWorktreePath(null);
        return;
      }
      setVirtualWorktreePath(normalizedNextPath);
    },
    [actualWorktreePath, paneId],
  );

  const clearVirtualWorktree = useCallback(() => {
    clearStoredSelection(paneId);
    setVirtualWorktreePath(null);
  }, [paneId]);

  const selectorEnabled = entries.length > 0;

  return {
    selectorEnabled,
    loading,
    error,
    repoRoot: normalizedRepoRoot,
    baseBranch,
    entries,
    actualWorktreePath,
    virtualWorktreePath,
    effectiveWorktreePath: selectedVirtualEntry?.path ?? null,
    effectiveBranch: selectedVirtualEntry ? selectedVirtualEntry.branch : actualBranch,
    selectVirtualWorktree,
    clearVirtualWorktree,
  };
};

export type SessionVirtualWorktreeState = {
  selectorEnabled: boolean;
  loading: boolean;
  error: string | null;
  repoRoot: string | null;
  baseBranch: string | null;
  entries: WorktreeListEntry[];
  actualWorktreePath: string | null;
  virtualWorktreePath: string | null;
  effectiveWorktreePath: string | null;
  effectiveBranch: string | null;
  selectVirtualWorktree: (path: string) => void;
  clearVirtualWorktree: () => void;
};
