import type { BranchList, SessionSummary } from "@vde-monitor/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { resolveUnknownErrorMessage } from "@/lib/api-utils";
import { useVisibilityPolling } from "@/lib/use-visibility-polling";

import { AUTO_REFRESH_INTERVAL_MS } from "../sessionDetailUtils";
import { createNextRequestId, isCurrentRequest } from "./session-request-guard";

type BranchMutationKind = "checkout" | "create" | "delete";

type UseSessionBranchesArgs = {
  paneId: string;
  connected: boolean;
  session: SessionSummary | null;
  requestBranches: (paneId: string, options?: { force?: boolean }) => Promise<BranchList>;
  requestBranchCheckout: (paneId: string, branch: string) => Promise<void>;
  requestBranchCreate: (paneId: string, name: string, base?: string) => Promise<void>;
  requestBranchDelete: (
    paneId: string,
    name: string,
    options?: { force?: boolean },
  ) => Promise<void>;
};

export const useSessionBranches = ({
  paneId,
  connected,
  session,
  requestBranches,
  requestBranchCheckout,
  requestBranchCreate,
  requestBranchDelete,
}: UseSessionBranchesArgs) => {
  const [branchList, setBranchList] = useState<BranchList | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mutating, setMutating] = useState<{ kind: BranchMutationKind; name: string } | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const latestRequestIdRef = useRef(0);
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    latestRequestIdRef.current += 1;
    hasLoadedRef.current = false;
    setBranchList(null);
    setError(null);
    setMutationError(null);
    setLoading(false);
  }, [paneId]);

  const fetchBranches = useCallback(
    async (options?: { resetEntries?: boolean; force?: boolean }) => {
      const requestId = createNextRequestId(latestRequestIdRef);
      const shouldReset = options?.resetEntries === true;
      const shouldShowLoading = shouldReset || !hasLoadedRef.current;
      if (shouldReset) {
        hasLoadedRef.current = false;
        setBranchList(null);
      }
      if (shouldShowLoading) {
        setLoading(true);
      }
      setError(null);
      try {
        const next = await requestBranches(
          paneId,
          options?.force === true ? { force: true } : undefined,
        );
        if (!isCurrentRequest(latestRequestIdRef, requestId)) {
          return;
        }
        setBranchList(next);
        hasLoadedRef.current = true;
      } catch (nextError) {
        if (!isCurrentRequest(latestRequestIdRef, requestId)) {
          return;
        }
        if (shouldShowLoading) {
          setBranchList(null);
        }
        setError(resolveUnknownErrorMessage(nextError, "Failed to load branches"));
      } finally {
        if (isCurrentRequest(latestRequestIdRef, requestId) && shouldShowLoading) {
          setLoading(false);
        }
      }
    },
    [paneId, requestBranches],
  );

  useEffect(() => {
    void fetchBranches({ resetEntries: true });
  }, [fetchBranches, session?.repoRoot]);

  useVisibilityPolling({
    enabled: Boolean(paneId) && connected,
    intervalMs: AUTO_REFRESH_INTERVAL_MS,
    onTick: useCallback(() => {
      void fetchBranches();
    }, [fetchBranches]),
  });

  const runMutation = useCallback(
    async (kind: BranchMutationKind, name: string, mutate: () => Promise<void>) => {
      setMutating({ kind, name });
      setMutationError(null);
      try {
        await mutate();
        await fetchBranches({ force: true });
        return true;
      } catch (err) {
        setMutationError(resolveUnknownErrorMessage(err, `Failed to ${kind} branch`));
        return false;
      } finally {
        setMutating(null);
      }
    },
    [fetchBranches],
  );

  const checkoutBranch = useCallback(
    (name: string) => runMutation("checkout", name, () => requestBranchCheckout(paneId, name)),
    [paneId, requestBranchCheckout, runMutation],
  );
  const createBranch = useCallback(
    (name: string, base?: string) =>
      runMutation("create", name, () => requestBranchCreate(paneId, name, base)),
    [paneId, requestBranchCreate, runMutation],
  );
  const deleteBranch = useCallback(
    (name: string, options?: { force?: boolean }) =>
      runMutation("delete", name, () => requestBranchDelete(paneId, name, options)),
    [paneId, requestBranchDelete, runMutation],
  );

  const branches = useMemo(() => branchList?.entries ?? [], [branchList]);

  return {
    branchList,
    branches,
    defaultBranch: branchList?.defaultBranch ?? null,
    currentBranch: branchList?.currentBranch ?? null,
    branchesLoading: loading,
    branchesError: error,
    mutating,
    mutationError,
    clearMutationError: useCallback(() => setMutationError(null), []),
    refreshBranches: useCallback(() => fetchBranches({ force: true }), [fetchBranches]),
    checkoutBranch,
    createBranch,
    deleteBranch,
  };
};
