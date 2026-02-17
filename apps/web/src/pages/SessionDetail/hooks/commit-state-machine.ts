import type { CommitDetail, CommitFileDiff, CommitLog } from "@vde-monitor/shared";

import { type CommitState, initialCommitState } from "../atoms/commitAtoms";

export type CommitAction =
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

export const mergeCommits = (
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

export const pruneStateToCommitSet = (
  state: CommitState,
  commits: CommitLog["commits"],
): CommitState => {
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

export const applyCommitLogState = (
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

export const commitReducer = (state: CommitState, action: CommitAction): CommitState => {
  const handler = commitReducerHandlers[action.type] as (
    current: CommitState,
    nextAction: CommitAction,
  ) => CommitState;
  return handler(state, action);
};
