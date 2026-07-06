import type { BranchList } from "@vde-monitor/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
  const invalidatedSelectionRef = useRef<{ paneId: string; branch: string } | null>(null);
  const [virtualBranchState, setVirtualBranchState] = useState<{
    paneId: string;
    branch: string | null;
    // react-doctor-disable-next-line no-event-handler
  }>(() => ({ paneId, branch: null }));

  const branchNames = useMemo(
    // react-doctor-disable-next-line no-event-handler
    () => new Set((branchList?.entries ?? []).map((entry) => entry.name)),
    [branchList],
  );
  const defaultBranch = branchList?.defaultBranch ?? null;
  // react-doctor-disable-next-line no-event-handler
  const repoRoot = branchList?.repoRoot ?? null;
  const storedVirtualBranch =
    // react-doctor-disable-next-line no-event-handler
    virtualBranchState.paneId === paneId &&
    !(
      invalidatedSelectionRef.current?.paneId === paneId &&
      invalidatedSelectionRef.current.branch === virtualBranchState.branch
    )
      ? virtualBranchState.branch
      : null;
  const virtualBranch =
    storedVirtualBranch && (branchNames.size === 0 || branchNames.has(storedVirtualBranch))
      ? storedVirtualBranch
      : null;

  // Restore stored selection once the branch list is available.
  useEffect(() => {
    if (!branchList || !repoRoot) {
      return;
    }
    // react-doctor-disable-next-line no-event-handler
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
    invalidatedSelectionRef.current = null;
    setVirtualBranchState((prev) =>
      prev.paneId === paneId && prev.branch === stored.branch
        ? prev
        : { paneId, branch: stored.branch },
    );
  }, [branchList, branchNames, defaultBranch, paneId, repoRoot]);

  // Drop the selection when the branch disappears (e.g. deleted).
  useEffect(() => {
    if (!storedVirtualBranch) {
      return;
    }
    if (branchNames.size > 0 && !branchNames.has(storedVirtualBranch)) {
      clearStoredSelection(paneId);
      invalidatedSelectionRef.current = { paneId, branch: storedVirtualBranch };
    }
  }, [branchNames, paneId, storedVirtualBranch]);

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
        invalidatedSelectionRef.current = null;
        setVirtualBranchState({ paneId, branch: null });
        return;
      }
      invalidatedSelectionRef.current = null;
      setVirtualBranchState({ paneId, branch: name });
    },
    [defaultBranch, paneId],
  );

  const clearVirtualBranch = useCallback(() => {
    clearStoredSelection(paneId);
    invalidatedSelectionRef.current = null;
    setVirtualBranchState({ paneId, branch: null });
  }, [paneId]);

  return {
    virtualBranch,
    selectVirtualBranch,
    clearVirtualBranch,
  };
};
