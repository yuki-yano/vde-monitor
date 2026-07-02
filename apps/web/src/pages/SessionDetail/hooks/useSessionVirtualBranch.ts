import type { BranchList } from "@vde-monitor/shared";
import { useCallback, useEffect, useMemo, useState } from "react";

const VIRTUAL_BRANCH_STORAGE_KEY_PREFIX = "vde-monitor:virtual-branch:v1";

type StoredVirtualBranchSelection = {
  repoRoot: string | null;
  branch: string;
  updatedAt: string;
};

const buildStorageKey = (paneId: string) => `${VIRTUAL_BRANCH_STORAGE_KEY_PREFIX}:${paneId}`;

const readStoredSelection = (paneId: string): StoredVirtualBranchSelection | null => {
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
    const parsed = JSON.parse(raw) as Partial<StoredVirtualBranchSelection>;
    if (
      typeof parsed.branch !== "string" ||
      (parsed.repoRoot != null && typeof parsed.repoRoot !== "string")
    ) {
      return null;
    }
    return {
      repoRoot: parsed.repoRoot ?? null,
      branch: parsed.branch,
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

const writeStoredSelection = (paneId: string, value: StoredVirtualBranchSelection) => {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(buildStorageKey(paneId), JSON.stringify(value));
  } catch {
    return;
  }
};

type UseSessionVirtualBranchArgs = {
  paneId: string;
  branchList: BranchList | null;
};

export const useSessionVirtualBranch = ({ paneId, branchList }: UseSessionVirtualBranchArgs) => {
  const [virtualBranch, setVirtualBranch] = useState<string | null>(null);

  const branchNames = useMemo(
    () => new Set((branchList?.entries ?? []).map((entry) => entry.name)),
    [branchList],
  );
  const defaultBranch = branchList?.defaultBranch ?? null;
  const repoRoot = branchList?.repoRoot ?? null;

  useEffect(() => {
    setVirtualBranch(null);
  }, [paneId]);

  // Restore stored selection once the branch list is available.
  useEffect(() => {
    if (!branchList || !repoRoot) {
      return;
    }
    const stored = readStoredSelection(paneId);
    if (!stored) {
      return;
    }
    if (stored.repoRoot && stored.repoRoot !== repoRoot) {
      clearStoredSelection(paneId);
      return;
    }
    if (!branchNames.has(stored.branch) || stored.branch === defaultBranch) {
      clearStoredSelection(paneId);
      return;
    }
    setVirtualBranch((prev) => (prev === stored.branch ? prev : stored.branch));
  }, [branchList, branchNames, defaultBranch, paneId, repoRoot]);

  // Drop the selection when the branch disappears (e.g. deleted).
  useEffect(() => {
    if (!virtualBranch) {
      return;
    }
    if (branchNames.size > 0 && !branchNames.has(virtualBranch)) {
      clearStoredSelection(paneId);
      setVirtualBranch(null);
    }
  }, [branchNames, paneId, virtualBranch]);

  useEffect(() => {
    if (!virtualBranch || !repoRoot) {
      return;
    }
    writeStoredSelection(paneId, {
      repoRoot,
      branch: virtualBranch,
      updatedAt: new Date().toISOString(),
    });
  }, [paneId, repoRoot, virtualBranch]);

  const selectVirtualBranch = useCallback(
    (name: string) => {
      if (name === defaultBranch) {
        clearStoredSelection(paneId);
        setVirtualBranch(null);
        return;
      }
      setVirtualBranch(name);
    },
    [defaultBranch, paneId],
  );

  const clearVirtualBranch = useCallback(() => {
    clearStoredSelection(paneId);
    setVirtualBranch(null);
  }, [paneId]);

  return {
    virtualBranch,
    selectVirtualBranch,
    clearVirtualBranch,
  };
};
