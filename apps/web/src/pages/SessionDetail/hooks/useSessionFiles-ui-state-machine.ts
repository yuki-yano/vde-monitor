import type { RepoFileContent, RepoFileSearchPage, RepoFileTreePage } from "@vde-monitor/shared";
import type { Dispatch, SetStateAction } from "react";

import type { LogFileCandidateItem } from "./useSessionFiles-log-resolve-state";

// Single reducer backing all SessionDetail file-navigator state: fuzzy search,
// file content modal, log-reference resolution, and (since T7) tree browsing
// (treePages/expandedDirSet/etc., formerly separate useState calls). Keeping
// everything in one state object lets a context switch (pane/worktree change)
// reset the whole navigator with a single `contextReset` dispatch instead of
// ~30 individual setter calls.
export type SessionFilesUiState = {
  selectedFilePath: string | null;
  searchQuery: string;
  searchResult: RepoFileSearchPage | null;
  searchLoading: boolean;
  searchError: string | null;
  searchActiveIndex: number;
  fileModalOpen: boolean;
  fileModalPath: string | null;
  fileModalLoading: boolean;
  fileModalError: string | null;
  fileModalFile: RepoFileContent | null;
  fileModalMarkdownViewMode: "code" | "preview" | "diff";
  fileModalShowLineNumbers: boolean;
  fileModalCopiedPath: boolean;
  fileModalCopyError: string | null;
  fileModalHighlightLine: number | null;
  fileResolveError: string | null;
  logFileCandidateModalOpen: boolean;
  logFileCandidateReference: string | null;
  logFileCandidatePaneId: string | null;
  logFileCandidateLine: number | null;
  logFileCandidateItems: LogFileCandidateItem[];
  expandedDirSet: Set<string>;
  searchExpandedDirSet: Set<string>;
  searchCollapsedDirSet: Set<string>;
  treePages: Record<string, RepoFileTreePage>;
  treeLoadingByPath: Record<string, boolean>;
  treeError: string | null;
};

type SessionFilesUiStateKey = keyof SessionFilesUiState;

export type SessionFilesUiAction =
  | {
      type: "set";
      key: SessionFilesUiStateKey;
      value: unknown;
    }
  | { type: "contextReset" }
  | { type: "openFileModal"; path: string; highlightLine: number | null }
  | {
      type: "fileModalLoaded";
      file: RepoFileContent;
      markdownViewMode: "code" | "preview";
    }
  | { type: "fileModalLoadFailed"; message: string }
  | { type: "closeFileModal" }
  | { type: "startLogResolve" }
  | {
      type: "openLogFileCandidate";
      reference: string;
      paneId: string;
      line: number | null;
      items: LogFileCandidateItem[];
    }
  | { type: "closeLogFileCandidate" };

export type SessionFilesUiDispatch = Dispatch<SessionFilesUiAction>;

const applySetStateAction = <T>(prev: T, action: unknown): T => {
  if (typeof action === "function") {
    return (action as (current: T) => T)(prev);
  }
  return action as T;
};

export const createInitialSessionFilesUiState = (): SessionFilesUiState => ({
  selectedFilePath: null,
  searchQuery: "",
  searchResult: null,
  searchLoading: false,
  searchError: null,
  searchActiveIndex: 0,
  fileModalOpen: false,
  fileModalPath: null,
  fileModalLoading: false,
  fileModalError: null,
  fileModalFile: null,
  fileModalMarkdownViewMode: "code",
  fileModalShowLineNumbers: true,
  fileModalCopiedPath: false,
  fileModalCopyError: null,
  fileModalHighlightLine: null,
  fileResolveError: null,
  logFileCandidateModalOpen: false,
  logFileCandidateReference: null,
  logFileCandidatePaneId: null,
  logFileCandidateLine: null,
  logFileCandidateItems: [],
  expandedDirSet: new Set(),
  searchExpandedDirSet: new Set(),
  searchCollapsedDirSet: new Set(),
  treePages: {},
  treeLoadingByPath: {},
  treeError: null,
});

const closedLogFileCandidateFields = {
  logFileCandidateModalOpen: false,
  logFileCandidateReference: null,
  logFileCandidatePaneId: null,
  logFileCandidateLine: null,
  logFileCandidateItems: [] as LogFileCandidateItem[],
} satisfies Partial<SessionFilesUiState>;

export const reduceSessionFilesUiState = (
  state: SessionFilesUiState,
  action: SessionFilesUiAction,
): SessionFilesUiState => {
  switch (action.type) {
    case "contextReset":
      return createInitialSessionFilesUiState();

    case "openFileModal":
      return {
        ...state,
        fileModalOpen: true,
        fileModalPath: action.path,
        fileModalLoading: true,
        fileModalError: null,
        fileModalShowLineNumbers: true,
        fileModalCopyError: null,
        fileModalCopiedPath: false,
        fileModalFile: null,
        fileModalHighlightLine: action.highlightLine,
      };

    case "fileModalLoaded":
      return {
        ...state,
        fileModalFile: action.file,
        fileModalLoading: false,
        fileModalError: null,
        fileModalMarkdownViewMode: action.markdownViewMode,
      };

    case "fileModalLoadFailed":
      return {
        ...state,
        fileModalFile: null,
        fileModalLoading: false,
        fileModalError: action.message,
      };

    case "closeFileModal":
      return {
        ...state,
        fileModalOpen: false,
        fileModalLoading: false,
        fileModalError: null,
        fileModalShowLineNumbers: true,
        fileModalCopyError: null,
        fileModalCopiedPath: false,
        fileModalHighlightLine: null,
      };

    case "startLogResolve":
      return {
        ...state,
        fileResolveError: null,
        ...closedLogFileCandidateFields,
      };

    case "openLogFileCandidate":
      return {
        ...state,
        logFileCandidateModalOpen: true,
        logFileCandidateReference: action.reference,
        logFileCandidatePaneId: action.paneId,
        logFileCandidateLine: action.line,
        logFileCandidateItems: action.items,
      };

    case "closeLogFileCandidate":
      return {
        ...state,
        ...closedLogFileCandidateFields,
      };

    case "set": {
      const key = action.key;
      const previousValue = state[key];
      const nextValue = applySetStateAction(previousValue as never, action.value);
      if (Object.is(previousValue, nextValue)) {
        return state;
      }
      return {
        ...state,
        [key]: nextValue,
      };
    }

    default:
      return state;
  }
};

/**
 * Dispatches a single-field update. Used directly by sub-hooks in place of
 * per-field setter props: `setUiState(dispatch, "searchQuery", "foo")` instead
 * of threading a `setSearchQuery` callback through props. `dispatch` from
 * `useReducer` is referentially stable, so this can be called inline from any
 * callback without becoming an extra dependency-array concern.
 */
export const setUiState = <K extends SessionFilesUiStateKey>(
  dispatch: SessionFilesUiDispatch,
  key: K,
  value: SetStateAction<SessionFilesUiState[K]>,
) => {
  dispatch({ type: "set", key, value });
};
