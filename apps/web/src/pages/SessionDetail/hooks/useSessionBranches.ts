import type { BranchList, SessionSummary } from "@vde-monitor/shared";
import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";

import { resolveUnknownErrorMessage } from "@/lib/api-utils";
import { useVisibilityPolling } from "@/lib/use-visibility-polling";

import { AUTO_REFRESH_INTERVAL_MS } from "../sessionDetailUtils";
import { createNextRequestId, isCurrentRequest } from "./session-request-guard";

type BranchMutationKind = "checkout" | "create" | "delete";

type BranchesState = {
  branchList: BranchList | null;
  loading: boolean;
  error: string | null;
  mutating: { kind: BranchMutationKind; name: string } | null;
  mutationError: string | null;
};

type BranchesAction =
  | { type: "resetPane" }
  | { type: "fetchStart"; resetEntries: boolean; showLoading: boolean }
  | { type: "fetchSuccess"; branchList: BranchList; showLoading: boolean }
  | { type: "fetchFailure"; error: string; resetEntries: boolean; showLoading: boolean }
  | { type: "mutationStart"; kind: BranchMutationKind; name: string }
  | { type: "mutationFailure"; error: string }
  | { type: "mutationFinish" }
  | { type: "clearMutationError" };

const initialBranchesState: BranchesState = {
  branchList: null,
  loading: false,
  error: null,
  mutating: null,
  mutationError: null,
};

const branchesReducer = (state: BranchesState, action: BranchesAction): BranchesState => {
  switch (action.type) {
    case "resetPane":
      return initialBranchesState;
    case "fetchStart":
      return {
        ...state,
        branchList: action.resetEntries ? null : state.branchList,
        loading: action.showLoading ? true : state.loading,
        error: null,
      };
    case "fetchSuccess":
      return {
        ...state,
        branchList: action.branchList,
        loading: action.showLoading ? false : state.loading,
        error: null,
      };
    case "fetchFailure":
      return {
        ...state,
        branchList: action.resetEntries || action.showLoading ? null : state.branchList,
        loading: action.showLoading ? false : state.loading,
        error: action.error,
      };
    case "mutationStart":
      return { ...state, mutating: { kind: action.kind, name: action.name }, mutationError: null };
    case "mutationFailure":
      return { ...state, mutationError: action.error };
    case "mutationFinish":
      return { ...state, mutating: null };
    case "clearMutationError":
      return { ...state, mutationError: null };
  }
};

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
  const [state, dispatch] = useReducer(branchesReducer, initialBranchesState);
  const latestRequestIdRef = useRef(0);
  const hasLoadedRef = useRef(false);
  const { branchList, loading, error, mutating, mutationError } = state;

  useEffect(() => {
    latestRequestIdRef.current += 1;
    hasLoadedRef.current = false;
    dispatch({ type: "resetPane" });
  }, [paneId]);

  const fetchBranches = useCallback(
    async (options?: { resetEntries?: boolean; force?: boolean }) => {
      const requestId = createNextRequestId(latestRequestIdRef);
      const shouldReset = options?.resetEntries === true;
      const shouldShowLoading = shouldReset || !hasLoadedRef.current;
      if (shouldReset) {
        hasLoadedRef.current = false;
      }
      dispatch({
        type: "fetchStart",
        resetEntries: shouldReset,
        showLoading: shouldShowLoading,
      });
      try {
        // False positive: request freshness is checked immediately after the fetch resolves.
        // react-doctor-disable-next-line async-defer-await
        const next = await requestBranches(
          paneId,
          options?.force === true ? { force: true } : undefined,
        );
        if (!isCurrentRequest(latestRequestIdRef, requestId)) {
          return;
        }
        hasLoadedRef.current = true;
        dispatch({ type: "fetchSuccess", branchList: next, showLoading: shouldShowLoading });
      } catch (nextError) {
        if (!isCurrentRequest(latestRequestIdRef, requestId)) {
          return;
        }
        dispatch({
          type: "fetchFailure",
          error: resolveUnknownErrorMessage(nextError, "Failed to load branches"),
          resetEntries: shouldReset,
          showLoading: shouldShowLoading,
        });
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
      dispatch({ type: "mutationStart", kind, name });
      try {
        await mutate();
        await fetchBranches({ force: true });
        return true;
      } catch (err) {
        dispatch({
          type: "mutationFailure",
          error: resolveUnknownErrorMessage(err, `Failed to ${kind} branch`),
        });
        return false;
      } finally {
        dispatch({ type: "mutationFinish" });
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
    clearMutationError: useCallback(() => dispatch({ type: "clearMutationError" }), []),
    refreshBranches: useCallback(() => fetchBranches({ force: true }), [fetchBranches]),
    checkoutBranch,
    createBranch,
    deleteBranch,
  };
};
