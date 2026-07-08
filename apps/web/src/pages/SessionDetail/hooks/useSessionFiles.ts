// Orchestrator for the SessionDetail file navigator. All state lives in the
// useSessionFiles-ui-state-machine reducer (fuzzy search / file modal / log
// resolution / tree browsing); the useSessionFiles-* sub-hooks each own one
// concern and are wired here in dependency order:
//   tree-loader -> request-actions -> tree-reveal -> file-modal-actions
//     -> context-reset-effect (needs loadTree + file-modal-actions' copy timer)
//   -> search-effects -> search-expand-state -> tree-actions -> onSelectFile
//     -> search-actions -> onRefresh
//   -> log-resolve-search -> log-linkable-actions -> log-resolve-actions
//   -> tree-render-nodes
// Sub-hooks take `(state, dispatch, deps)` rather than individual setter
// props: reads come from a `Pick<SessionFilesUiState, ...>` slice, writes go
// through the shared `dispatch` (stable identity from useReducer), and `deps`
// carries the small set of external inputs (API functions, refs, other
// sub-hooks' outputs) each one actually needs.
// Guarded by useSessionFiles.test.tsx (session-file-tree-fuzzy-finder spec).
import type { RepoFileContent, RepoFileSearchPage, RepoFileTreePage } from "@vde-monitor/shared";
import { useCallback, useEffect, useReducer, useRef } from "react";

import { API_ERROR_MESSAGES } from "@/lib/api-messages";
import { resolveUnknownErrorMessage } from "@/lib/api-utils";
import { useLazyRef } from "@/lib/use-lazy-ref";

import { createNextSearchRequestId } from "./session-files-search-effect";
import { useSessionFilesContextResetEffect } from "./useSessionFiles-context-reset-effect";
import { useSessionFilesFileModalActions } from "./useSessionFiles-file-modal-actions";
import { useSessionFilesLogLinkableActions } from "./useSessionFiles-log-linkable-actions";
import { useSessionFilesLogResolveActions } from "./useSessionFiles-log-resolve-actions";
import { useSessionFilesLogResolveSearch } from "./useSessionFiles-log-resolve-search";
import { useSessionFilesRequestActions } from "./useSessionFiles-request-actions";
import { useSessionFilesSearchActions } from "./useSessionFiles-search-actions";
import { useSessionFilesSearchEffects } from "./useSessionFiles-search-effects";
import { useSessionFilesSearchExpandState } from "./useSessionFiles-search-expand-state";
import { useSessionFilesTreeActions } from "./useSessionFiles-tree-actions";
import { useSessionFilesTreeLoader } from "./useSessionFiles-tree-loader";
import { useSessionFilesTreeRenderNodes } from "./useSessionFiles-tree-render-nodes";
import { useSessionFilesTreeReveal } from "./useSessionFiles-tree-reveal";
import {
  createInitialSessionFilesUiState,
  reduceSessionFilesUiState,
  setUiState,
} from "./useSessionFiles-ui-state-machine";

const TREE_PAGE_LIMIT = 200;
const SEARCH_PAGE_LIMIT = 100;
const SEARCH_DEBOUNCE_MS = 120;
const FILE_CONTENT_MAX_BYTES = 256 * 1024;
const LOG_FILE_RESOLVE_MATCH_LIMIT = 20;
const LOG_FILE_RESOLVE_PAGE_LIMIT = 100;
const LOG_FILE_RESOLVE_MAX_SEARCH_PAGES = 20;
const LOG_REFERENCE_LINKABLE_CACHE_MAX = 1000;

export type { FileTreeRenderNode } from "./session-files-tree-utils";

type UseSessionFilesParams = {
  paneId: string;
  repoRoot: string | null;
  worktreePath?: string | null;
  autoExpandMatchLimit: number;
  requestRepoFileTree: (
    paneId: string,
    options?: { path?: string; cursor?: string; limit?: number; worktreePath?: string },
  ) => Promise<RepoFileTreePage>;
  requestRepoFileSearch: (
    paneId: string,
    query: string,
    options?: {
      cursor?: string;
      limit?: number;
      worktreePath?: string;
      includeIgnoredPreviewExact?: boolean;
    },
  ) => Promise<RepoFileSearchPage>;
  requestRepoFileContent: (
    paneId: string,
    path: string,
    options?: { maxBytes?: number; worktreePath?: string; includeIgnoredPreviewExact?: boolean },
  ) => Promise<RepoFileContent>;
};

export const useSessionFiles = ({
  paneId,
  repoRoot,
  worktreePath = null,
  autoExpandMatchLimit,
  requestRepoFileTree,
  requestRepoFileSearch,
  requestRepoFileContent,
}: UseSessionFilesParams) => {
  const requestScopeId = `${paneId}:${worktreePath ?? "__default__"}`;
  const [state, dispatch] = useReducer(
    reduceSessionFilesUiState,
    undefined,
    createInitialSessionFilesUiState,
  );

  // Refs hold in-flight request bookkeeping only (request maps, request-id
  // counters, a mirror of treePages for synchronous reads from callbacks).
  // None of this should trigger a re-render, so it stays outside the reducer.
  const treePageRequestMapRef = useLazyRef(() => new Map<string, Promise<RepoFileTreePage>>());
  const searchRequestMapRef = useLazyRef(() => new Map<string, Promise<RepoFileSearchPage>>());
  const fileContentRequestMapRef = useLazyRef(() => new Map<string, Promise<RepoFileContent>>());
  const activeSearchRequestIdRef = useRef(0);
  const activeFileContentRequestIdRef = useRef(0);
  const activeLogResolveRequestIdRef = useRef(0);
  const logReferenceLinkableCacheRef = useLazyRef(() => new Map<string, boolean>());
  const logReferenceLinkableRequestMapRef = useLazyRef(() => new Map<string, Promise<boolean>>());
  const contextVersionRef = useRef(0);
  const treePagesRef = useRef<Record<string, RepoFileTreePage>>({});

  useEffect(() => {
    treePagesRef.current = state.treePages;
  }, [state.treePages]);

  const resolveWorktreePathForPane = useCallback(
    (targetPaneId: string) => (targetPaneId === paneId ? (worktreePath ?? undefined) : undefined),
    [paneId, worktreePath],
  );

  const { loadTree } = useSessionFilesTreeLoader(dispatch, {
    paneId,
    requestScopeId,
    repoRoot,
    worktreePath,
    treePageLimit: TREE_PAGE_LIMIT,
    requestRepoFileTree,
    treePageRequestMapRef,
    contextVersionRef,
    resolveUnknownErrorMessage,
  });

  const { fetchSearchPage, fetchFileContent } = useSessionFilesRequestActions({
    paneId,
    requestScopeId,
    worktreePath,
    searchPageLimit: SEARCH_PAGE_LIMIT,
    fileContentMaxBytes: FILE_CONTENT_MAX_BYTES,
    resolveWorktreePathForPane,
    requestRepoFileSearch,
    requestRepoFileContent,
    searchRequestMapRef,
    fileContentRequestMapRef,
  });

  const { revealFilePath } = useSessionFilesTreeReveal(dispatch, {
    repoRoot,
    treePagesRef,
    loadTree,
  });

  const {
    openFileModalByPath,
    onOpenFileModal,
    onCloseFileModal,
    onSetFileModalMarkdownViewMode,
    onToggleFileModalLineNumbers,
    onCopyFileModalPath,
    cancelCopyTimeout,
  } = useSessionFilesFileModalActions({ fileModalPath: state.fileModalPath }, dispatch, {
    paneId,
    fetchFileContent,
    revealFilePath,
    resolveUnknownErrorMessage,
    contextVersionRef,
    activeFileContentRequestIdRef,
  });

  useSessionFilesContextResetEffect(dispatch, {
    paneId,
    repoRoot,
    worktreePath,
    loadTree,
    treePageRequestMapRef,
    searchRequestMapRef,
    fileContentRequestMapRef,
    logReferenceLinkableCacheRef,
    logReferenceLinkableRequestMapRef,
    activeSearchRequestIdRef,
    activeFileContentRequestIdRef,
    activeLogResolveRequestIdRef,
    contextVersionRef,
    treePagesRef,
    cancelFileModalCopyTimeout: cancelCopyTimeout,
  });

  const resolveSearchErrorMessage = useCallback(
    (error: unknown) => resolveUnknownErrorMessage(error, API_ERROR_MESSAGES.fileSearch),
    [],
  );

  useSessionFilesSearchEffects(
    { searchQuery: state.searchQuery, searchResult: state.searchResult },
    dispatch,
    {
      repoRoot,
      searchDebounceMs: SEARCH_DEBOUNCE_MS,
      activeSearchRequestIdRef,
      fetchSearchPage,
      resolveSearchErrorMessage,
    },
  );

  const { searchExpandPlan, effectiveSearchExpandedDirSet, isSearchActive } =
    useSessionFilesSearchExpandState(
      {
        searchResult: state.searchResult,
        searchActiveIndex: state.searchActiveIndex,
        searchExpandedDirSet: state.searchExpandedDirSet,
        searchCollapsedDirSet: state.searchCollapsedDirSet,
        searchQuery: state.searchQuery,
      },
      { autoExpandMatchLimit },
    );

  const { onToggleDirectory, onLoadMoreTreeRoot } = useSessionFilesTreeActions(
    { expandedDirSet: state.expandedDirSet, treePages: state.treePages },
    dispatch,
    { isSearchActive, effectiveSearchExpandedDirSet, treePagesRef, loadTree },
  );

  const onSelectFile = useCallback(
    (targetPath: string) => {
      setUiState(dispatch, "selectedFilePath", targetPath);
      revealFilePath(targetPath);
    },
    [revealFilePath],
  );

  const { onSearchMove, onSearchConfirm, onLoadMoreSearch } = useSessionFilesSearchActions(
    {
      searchResult: state.searchResult,
      searchActiveIndex: state.searchActiveIndex,
      searchLoading: state.searchLoading,
    },
    dispatch,
    {
      fetchSearchPage,
      resolveUnknownErrorMessage,
      activeSearchRequestIdRef,
      onToggleDirectory,
      onSelectFile,
      onOpenFileModal,
    },
  );

  const onRefresh = useCallback(() => {
    if (!repoRoot) {
      return;
    }
    void loadTree(".");

    const normalizedQuery = state.searchQuery.trim();
    if (normalizedQuery.length === 0) {
      return;
    }
    const requestId = createNextSearchRequestId(activeSearchRequestIdRef);
    setUiState(dispatch, "searchLoading", true);
    setUiState(dispatch, "searchError", null);
    void fetchSearchPage(normalizedQuery)
      .then((nextPage) => {
        if (activeSearchRequestIdRef.current !== requestId) {
          return;
        }
        setUiState(dispatch, "searchResult", nextPage);
        setUiState(dispatch, "searchActiveIndex", 0);
      })
      .catch((error) => {
        if (activeSearchRequestIdRef.current !== requestId) {
          return;
        }
        setUiState(dispatch, "searchError", resolveSearchErrorMessage(error));
      })
      .finally(() => {
        if (activeSearchRequestIdRef.current !== requestId) {
          return;
        }
        setUiState(dispatch, "searchLoading", false);
      });
  }, [fetchSearchPage, loadTree, repoRoot, resolveSearchErrorMessage, state.searchQuery]);

  const { hasExactPathMatch, findExactNameMatches, tryOpenExistingPath } =
    useSessionFilesLogResolveSearch({
      resolveWorktreePathForPane,
      requestRepoFileSearch,
      activeLogResolveRequestIdRef,
      logFileResolveMaxSearchPages: LOG_FILE_RESOLVE_MAX_SEARCH_PAGES,
      logFileResolvePageLimit: LOG_FILE_RESOLVE_PAGE_LIMIT,
      openFileModalByPath,
    });

  const { onResolveLogFileReferenceCandidates } = useSessionFilesLogLinkableActions({
    hasExactPathMatch,
    findExactNameMatches,
    logReferenceLinkableCacheRef,
    logReferenceLinkableRequestMapRef,
    logReferenceLinkableCacheMax: LOG_REFERENCE_LINKABLE_CACHE_MAX,
    logFileResolvePageLimit: LOG_FILE_RESOLVE_PAGE_LIMIT,
  });

  const { onResolveLogFileReference, onSelectLogFileCandidate, onCloseLogFileCandidateModal } =
    useSessionFilesLogResolveActions(
      {
        logFileCandidatePaneId: state.logFileCandidatePaneId,
        logFileCandidateLine: state.logFileCandidateLine,
      },
      dispatch,
      {
        paneId,
        logFileResolveMatchLimit: LOG_FILE_RESOLVE_MATCH_LIMIT,
        logFileResolvePageLimit: LOG_FILE_RESOLVE_PAGE_LIMIT,
        activeLogResolveRequestIdRef,
        findExactNameMatches,
        tryOpenExistingPath,
        openFileModalByPath,
      },
    );

  const onSearchQueryChange = useCallback(
    (value: string) => setUiState(dispatch, "searchQuery", value),
    [],
  );

  const { treeNodes, rootTreeHasMore } = useSessionFilesTreeRenderNodes(
    {
      searchResult: state.searchResult,
      searchActiveIndex: state.searchActiveIndex,
      selectedFilePath: state.selectedFilePath,
      treePages: state.treePages,
      expandedDirSet: state.expandedDirSet,
    },
    { isSearchActive, effectiveSearchExpandedDirSet },
  );

  return {
    unavailable: !repoRoot,
    selectedFilePath: state.selectedFilePath,
    searchQuery: state.searchQuery,
    searchActiveIndex: state.searchActiveIndex,
    searchResult: state.searchResult,
    searchLoading: state.searchLoading,
    searchError: state.searchError,
    searchMode: searchExpandPlan.mode,
    treeLoading: Boolean(state.treeLoadingByPath["."]),
    treeError: state.treeError,
    treeNodes,
    rootTreeHasMore,
    searchHasMore: Boolean(state.searchResult?.nextCursor),
    fileModalOpen: state.fileModalOpen,
    fileModalPath: state.fileModalPath,
    fileModalLoading: state.fileModalLoading,
    fileModalError: state.fileModalError,
    fileModalFile: state.fileModalFile,
    fileModalMarkdownViewMode: state.fileModalMarkdownViewMode,
    fileModalShowLineNumbers: state.fileModalShowLineNumbers,
    fileModalCopiedPath: state.fileModalCopiedPath,
    fileModalCopyError: state.fileModalCopyError,
    fileModalHighlightLine: state.fileModalHighlightLine,
    fileResolveError: state.fileResolveError,
    logFileCandidateModalOpen: state.logFileCandidateModalOpen,
    logFileCandidateReference: state.logFileCandidateReference,
    logFileCandidatePaneId: state.logFileCandidatePaneId,
    logFileCandidateItems: state.logFileCandidateItems,
    onRefresh,
    onSearchQueryChange,
    onSearchMove,
    onSearchConfirm,
    onToggleDirectory,
    onSelectFile,
    onOpenFileModal,
    onCloseFileModal,
    onSetFileModalMarkdownViewMode,
    onToggleFileModalLineNumbers,
    onCopyFileModalPath,
    onResolveLogFileReference,
    onResolveLogFileReferenceCandidates,
    onSelectLogFileCandidate,
    onCloseLogFileCandidateModal,
    onLoadMoreTreeRoot,
    onLoadMoreSearch,
  };
};
