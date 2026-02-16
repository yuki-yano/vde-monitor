import type { CommitDetail, CommitFileDiff, CommitLog } from "@vde-monitor/shared";
import { useAtom } from "jotai";
import { useCallback, useEffect, useRef } from "react";

import { API_ERROR_MESSAGES } from "@/lib/api-messages";
import { copyToClipboard } from "@/lib/copy-to-clipboard";
import { useVisibilityPolling } from "@/lib/use-visibility-polling";

import { type CommitState, commitStateAtom, initialCommitState } from "../atoms/commitAtoms";
import { AUTO_REFRESH_INTERVAL_MS, buildCommitLogSignature } from "../sessionDetailUtils";

type UseSessionCommitsParams = {
  paneId: string;
  connected: boolean;
  worktreePath?: string | null;
  requestCommitLog: (
    paneId: string,
    options?: { limit?: number; skip?: number; force?: boolean; worktreePath?: string },
  ) => Promise<CommitLog>;
  requestCommitDetail: (
    paneId: string,
    hash: string,
    options?: { force?: boolean; worktreePath?: string },
  ) => Promise<CommitDetail>;
  requestCommitFile: (
    paneId: string,
    hash: string,
    path: string,
    options?: { force?: boolean; worktreePath?: string },
  ) => Promise<CommitFileDiff>;
};

type CommitAction =
  | { type: "reset" }
  | { type: "setCommitError"; error: string | null }
  | { type: "startLogLoad"; append: boolean }
  | { type: "finishLogLoad"; append: boolean }
  | { type: "applyCommitLog"; log: CommitLog; append: boolean; pageSize: number }
  | { type: "setCommitDetail"; hash: string; detail: CommitDetail }
  | { type: "setCommitFileDetail"; key: string; file: CommitFileDiff }
  | { type: "setCommitOpen"; hash: string; open: boolean }
  | { type: "setCommitFileOpen"; key: string; open: boolean }
  | { type: "setCommitLoadingDetails"; hash: string; loading: boolean }
  | { type: "setCommitFileLoading"; key: string; loading: boolean }
  | { type: "setCopiedHash"; hash: string | null }
  | { type: "clearCopiedHash"; hash: string };

type CommitDispatch = (action: CommitAction) => void;
type CommitActionByType<T extends CommitAction["type"]> = Extract<CommitAction, { type: T }>;

const filterByCommitSet = <T>(record: Record<string, T>, commitSet: Set<string>) => {
  const next: Record<string, T> = {};
  Object.entries(record).forEach(([key, value]) => {
    if (commitSet.has(key)) {
      next[key] = value;
    }
  });
  return next;
};

const filterByCommitFileSet = <T>(record: Record<string, T>, commitSet: Set<string>) => {
  const next: Record<string, T> = {};
  Object.entries(record).forEach(([key, value]) => {
    const [hash] = key.split(":");
    if (hash && commitSet.has(hash)) {
      next[key] = value;
    }
  });
  return next;
};

const mergeCommits = (
  current: CommitLog["commits"],
  incoming: CommitLog["commits"],
  append: boolean,
) => {
  const source = append ? [...current, ...incoming] : incoming;
  const unique = new Map<string, (typeof source)[number]>();
  source.forEach((commit) => {
    if (!unique.has(commit.hash)) {
      unique.set(commit.hash, commit);
    }
  });
  return Array.from(unique.values());
};

const pruneStateToCommitSet = (state: CommitState, commits: CommitLog["commits"]): CommitState => {
  if (commits.length === 0) {
    return { ...state, commitOpen: {} };
  }
  const commitSet = new Set(commits.map((commit) => commit.hash));
  return {
    ...state,
    commitDetails: filterByCommitSet(state.commitDetails, commitSet),
    commitFileDetails: filterByCommitFileSet(state.commitFileDetails, commitSet),
    commitFileOpen: filterByCommitFileSet(state.commitFileOpen, commitSet),
    commitFileLoading: filterByCommitFileSet(state.commitFileLoading, commitSet),
    commitOpen: filterByCommitSet(state.commitOpen, commitSet),
  };
};

const applyCommitLogState = (
  state: CommitState,
  action: CommitActionByType<"applyCommitLog">,
): CommitState => {
  const prevCommits = action.append && state.commitLog ? state.commitLog.commits : [];
  const commits = mergeCommits(prevCommits, action.log.commits, action.append);
  const nextState: CommitState = {
    ...state,
    commitLog: { ...action.log, commits },
    commitHasMore: action.log.commits.length === action.pageSize,
  };
  if (action.append) {
    return nextState;
  }
  return pruneStateToCommitSet(nextState, action.log.commits);
};

const commitReducerHandlers = {
  reset: () => initialCommitState,
  setCommitError: (state: CommitState, action: CommitActionByType<"setCommitError">) => ({
    ...state,
    commitError: action.error,
  }),
  startLogLoad: (state: CommitState, action: CommitActionByType<"startLogLoad">) =>
    action.append ? { ...state, commitLoadingMore: true } : { ...state, commitLoading: true },
  finishLogLoad: (state: CommitState, action: CommitActionByType<"finishLogLoad">) =>
    action.append ? { ...state, commitLoadingMore: false } : { ...state, commitLoading: false },
  applyCommitLog: (state: CommitState, action: CommitActionByType<"applyCommitLog">) =>
    applyCommitLogState(state, action),
  setCommitDetail: (state: CommitState, action: CommitActionByType<"setCommitDetail">) => ({
    ...state,
    commitDetails: { ...state.commitDetails, [action.hash]: action.detail },
  }),
  setCommitFileDetail: (state: CommitState, action: CommitActionByType<"setCommitFileDetail">) => ({
    ...state,
    commitFileDetails: { ...state.commitFileDetails, [action.key]: action.file },
  }),
  setCommitOpen: (state: CommitState, action: CommitActionByType<"setCommitOpen">) => ({
    ...state,
    commitOpen: { ...state.commitOpen, [action.hash]: action.open },
  }),
  setCommitFileOpen: (state: CommitState, action: CommitActionByType<"setCommitFileOpen">) => ({
    ...state,
    commitFileOpen: { ...state.commitFileOpen, [action.key]: action.open },
  }),
  setCommitLoadingDetails: (
    state: CommitState,
    action: CommitActionByType<"setCommitLoadingDetails">,
  ) => ({
    ...state,
    commitLoadingDetails: { ...state.commitLoadingDetails, [action.hash]: action.loading },
  }),
  setCommitFileLoading: (
    state: CommitState,
    action: CommitActionByType<"setCommitFileLoading">,
  ) => ({
    ...state,
    commitFileLoading: { ...state.commitFileLoading, [action.key]: action.loading },
  }),
  setCopiedHash: (state: CommitState, action: CommitActionByType<"setCopiedHash">) => ({
    ...state,
    copiedHash: action.hash,
  }),
  clearCopiedHash: (state: CommitState, action: CommitActionByType<"clearCopiedHash">) =>
    state.copiedHash === action.hash ? { ...state, copiedHash: null } : state,
} satisfies {
  [K in CommitAction["type"]]: (state: CommitState, action: CommitActionByType<K>) => CommitState;
};

const commitReducer = (state: CommitState, action: CommitAction): CommitState => {
  const handler = commitReducerHandlers[action.type] as (
    current: CommitState,
    nextAction: CommitAction,
  ) => CommitState;
  return handler(state, action);
};

const resolveCommitLogError = (err: unknown) =>
  err instanceof Error ? err.message : API_ERROR_MESSAGES.commitLog;

const dispatchCommitLogError = (dispatch: CommitDispatch, append: boolean, err: unknown) => {
  if (append) {
    return;
  }
  dispatch({ type: "setCommitError", error: resolveCommitLogError(err) });
};

const resolveCommitLogLoadOptions = (options?: { append?: boolean; force?: boolean }) => ({
  append: options?.append ?? false,
  force: options?.force,
});

const resolveCommitLogSkip = (append: boolean, commitLog: CommitLog | null) => {
  if (!append) {
    return 0;
  }
  return commitLog?.commits.length ?? 0;
};

export const useSessionCommits = ({
  paneId,
  connected,
  worktreePath = null,
  requestCommitLog,
  requestCommitDetail,
  requestCommitFile,
}: UseSessionCommitsParams) => {
  const commitPageSize = 10;
  const [state, setState] = useAtom(commitStateAtom);
  const dispatch = useCallback(
    (action: CommitAction) => {
      setState((prev) => commitReducer(prev, action));
    },
    [setState],
  );
  const {
    commitLog,
    commitError,
    commitLoading,
    commitLoadingMore,
    commitHasMore,
    commitDetails,
    commitFileDetails,
    commitFileOpen,
    commitFileLoading,
    commitOpen,
    commitLoadingDetails,
    copiedHash,
  } = state;

  const commitLogRef = useRef<CommitLog | null>(null);
  const commitSignatureRef = useRef<string | null>(null);
  const commitCopyTimeoutRef = useRef<number | null>(null);
  const prevConnectedRef = useRef<boolean | null>(null);
  const requestScopeKey = `${paneId}:${worktreePath ?? "__default__"}`;
  const activeScopeRef = useRef(requestScopeKey);
  const commitLogRequestIdRef = useRef(0);
  activeScopeRef.current = requestScopeKey;

  const applyCommitLog = useCallback(
    (log: CommitLog, options: { append: boolean; updateSignature: boolean }) => {
      dispatch({ type: "applyCommitLog", log, append: options.append, pageSize: commitPageSize });
      if (options.updateSignature) {
        commitSignatureRef.current = buildCommitLogSignature(log);
      }
    },
    [commitPageSize, dispatch],
  );

  const loadCommitLog = useCallback(
    async (options?: { append?: boolean; force?: boolean }) => {
      if (!paneId) return;
      const targetScopeKey = requestScopeKey;
      const requestId = commitLogRequestIdRef.current + 1;
      commitLogRequestIdRef.current = requestId;
      const { append, force } = resolveCommitLogLoadOptions(options);
      dispatch({ type: "startLogLoad", append });
      dispatch({ type: "setCommitError", error: null });
      try {
        const skip = resolveCommitLogSkip(append, commitLogRef.current);
        const log = await requestCommitLog(paneId, {
          limit: commitPageSize,
          skip,
          force,
          ...(worktreePath ? { worktreePath } : {}),
        });
        if (
          activeScopeRef.current !== targetScopeKey ||
          commitLogRequestIdRef.current !== requestId
        ) {
          return;
        }
        applyCommitLog(log, { append, updateSignature: !append });
      } catch (err) {
        if (
          activeScopeRef.current !== targetScopeKey ||
          commitLogRequestIdRef.current !== requestId
        ) {
          return;
        }
        dispatchCommitLogError(dispatch, append, err);
      } finally {
        if (
          activeScopeRef.current === targetScopeKey &&
          commitLogRequestIdRef.current === requestId
        ) {
          dispatch({ type: "finishLogLoad", append });
        }
      }
    },
    [
      applyCommitLog,
      commitPageSize,
      dispatch,
      paneId,
      requestCommitLog,
      requestScopeKey,
      worktreePath,
    ],
  );

  const loadCommitDetail = useCallback(
    async (hash: string) => {
      if (!paneId || commitLoadingDetails[hash]) return;
      const targetScopeKey = requestScopeKey;
      dispatch({ type: "setCommitLoadingDetails", hash, loading: true });
      try {
        const detail = await requestCommitDetail(
          paneId,
          hash,
          worktreePath ? { force: true, worktreePath } : { force: true },
        );
        if (activeScopeRef.current !== targetScopeKey) {
          return;
        }
        dispatch({ type: "setCommitDetail", hash, detail });
      } catch (err) {
        if (activeScopeRef.current !== targetScopeKey) {
          return;
        }
        dispatch({
          type: "setCommitError",
          error: err instanceof Error ? err.message : API_ERROR_MESSAGES.commitDetail,
        });
      } finally {
        if (activeScopeRef.current === targetScopeKey) {
          dispatch({ type: "setCommitLoadingDetails", hash, loading: false });
        }
      }
    },
    [commitLoadingDetails, dispatch, paneId, requestCommitDetail, requestScopeKey, worktreePath],
  );

  const loadCommitFile = useCallback(
    async (hash: string, path: string) => {
      if (!paneId) return;
      const key = `${hash}:${path}`;
      if (commitFileLoading[key]) return;
      const targetScopeKey = requestScopeKey;
      dispatch({ type: "setCommitFileLoading", key, loading: true });
      try {
        const file = await requestCommitFile(
          paneId,
          hash,
          path,
          worktreePath ? { force: true, worktreePath } : { force: true },
        );
        if (activeScopeRef.current !== targetScopeKey) {
          return;
        }
        dispatch({ type: "setCommitFileDetail", key, file });
      } catch (err) {
        if (activeScopeRef.current !== targetScopeKey) {
          return;
        }
        dispatch({
          type: "setCommitError",
          error: err instanceof Error ? err.message : API_ERROR_MESSAGES.commitFile,
        });
      } finally {
        if (activeScopeRef.current === targetScopeKey) {
          dispatch({ type: "setCommitFileLoading", key, loading: false });
        }
      }
    },
    [commitFileLoading, dispatch, paneId, requestCommitFile, requestScopeKey, worktreePath],
  );

  const pollCommitLog = useCallback(async () => {
    if (!paneId) return;
    const targetScopeKey = requestScopeKey;
    const requestId = commitLogRequestIdRef.current + 1;
    commitLogRequestIdRef.current = requestId;
    try {
      const log = await requestCommitLog(paneId, {
        limit: commitPageSize,
        skip: 0,
        force: true,
        ...(worktreePath ? { worktreePath } : {}),
      });
      if (
        activeScopeRef.current !== targetScopeKey ||
        commitLogRequestIdRef.current !== requestId
      ) {
        return;
      }
      const signature = buildCommitLogSignature(log);
      if (signature === commitSignatureRef.current) {
        return;
      }
      dispatch({ type: "setCommitError", error: null });
      applyCommitLog(log, { append: false, updateSignature: true });
    } catch {
      return;
    }
  }, [
    applyCommitLog,
    commitPageSize,
    dispatch,
    paneId,
    requestCommitLog,
    requestScopeKey,
    worktreePath,
  ]);
  const pollCommitLogTick = useCallback(() => {
    void pollCommitLog();
  }, [pollCommitLog]);

  const toggleCommit = useCallback(
    (hash: string) => {
      const nextOpen = !commitOpen[hash];
      dispatch({ type: "setCommitOpen", hash, open: nextOpen });
      if (nextOpen && !commitDetails[hash]) {
        void loadCommitDetail(hash);
      }
    },
    [commitDetails, commitOpen, dispatch, loadCommitDetail],
  );

  const toggleCommitFile = useCallback(
    (hash: string, path: string) => {
      const key = `${hash}:${path}`;
      const nextOpen = !commitFileOpen[key];
      dispatch({ type: "setCommitFileOpen", key, open: nextOpen });
      if (nextOpen && !commitFileDetails[key]) {
        void loadCommitFile(hash, path);
      }
    },
    [commitFileDetails, commitFileOpen, dispatch, loadCommitFile],
  );

  const copyHash = useCallback(
    async (hash: string) => {
      const copied = await copyToClipboard(hash);
      if (!copied) return;
      dispatch({ type: "setCopiedHash", hash });
      if (commitCopyTimeoutRef.current) {
        window.clearTimeout(commitCopyTimeoutRef.current);
      }
      commitCopyTimeoutRef.current = window.setTimeout(() => {
        dispatch({ type: "clearCopiedHash", hash });
      }, 1200);
    },
    [dispatch],
  );

  useEffect(() => {
    commitLogRef.current = commitLog;
  }, [commitLog]);

  useEffect(() => {
    dispatch({ type: "reset" });
    commitSignatureRef.current = null;
    commitLogRef.current = null;
    if (commitCopyTimeoutRef.current) {
      window.clearTimeout(commitCopyTimeoutRef.current);
      commitCopyTimeoutRef.current = null;
    }
  }, [dispatch, paneId, worktreePath]);

  useEffect(() => {
    loadCommitLog({ force: true });
  }, [loadCommitLog]);

  useEffect(() => {
    if (prevConnectedRef.current === false && connected) {
      void loadCommitLog({ force: true });
    }
    prevConnectedRef.current = connected;
  }, [connected, loadCommitLog]);

  useVisibilityPolling({
    enabled: Boolean(paneId) && connected,
    intervalMs: AUTO_REFRESH_INTERVAL_MS,
    onTick: pollCommitLogTick,
  });

  useEffect(() => {
    return () => {
      if (commitCopyTimeoutRef.current) {
        window.clearTimeout(commitCopyTimeoutRef.current);
      }
    };
  }, []);

  return {
    commitLog,
    commitError,
    commitLoading,
    commitLoadingMore,
    commitHasMore,
    commitDetails,
    commitFileDetails,
    commitFileOpen,
    commitFileLoading,
    commitOpen,
    commitLoadingDetails,
    copiedHash,
    refreshCommitLog: () => loadCommitLog({ force: true }),
    loadMoreCommits: () => loadCommitLog({ append: true, force: true }),
    toggleCommit,
    toggleCommitFile,
    copyHash,
  };
};
