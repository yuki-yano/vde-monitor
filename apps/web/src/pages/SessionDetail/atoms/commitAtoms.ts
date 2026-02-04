import type { CommitDetail, CommitFileDiff, CommitLog } from "@vde-monitor/shared";
import { atom } from "jotai";

export type CommitState = {
  commitLog: CommitLog | null;
  commitError: string | null;
  commitLoading: boolean;
  commitLoadingMore: boolean;
  commitHasMore: boolean;
  commitDetails: Record<string, CommitDetail>;
  commitFileDetails: Record<string, CommitFileDiff>;
  commitFileOpen: Record<string, boolean>;
  commitFileLoading: Record<string, boolean>;
  commitOpen: Record<string, boolean>;
  commitLoadingDetails: Record<string, boolean>;
  copiedHash: string | null;
};

export const initialCommitState: CommitState = {
  commitLog: null,
  commitError: null,
  commitLoading: false,
  commitLoadingMore: false,
  commitHasMore: true,
  commitDetails: {},
  commitFileDetails: {},
  commitFileOpen: {},
  commitFileLoading: {},
  commitOpen: {},
  commitLoadingDetails: {},
  copiedHash: null,
};

export const commitStateAtom = atom<CommitState>(initialCommitState);
