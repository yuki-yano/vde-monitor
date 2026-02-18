import type { RepoFileContent, RepoFileSearchPage, RepoFileTreePage } from "@vde-monitor/shared";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";

import { API_ERROR_MESSAGES } from "@/lib/api-messages";
import { resolveUnknownErrorMessage } from "@/lib/api-utils";

import { createNextSearchRequestId } from "./session-files-search-effect";
import { useSessionFilesContextResetEffect } from "./useSessionFiles-context-reset-effect";
import { useSessionFilesFileModalActions } from "./useSessionFiles-file-modal-actions";
import { useSessionFilesLogLinkableActions } from "./useSessionFiles-log-linkable-actions";
import { useSessionFilesLogResolveActions } from "./useSessionFiles-log-resolve-actions";
import { useSessionFilesLogResolveSearch } from "./useSessionFiles-log-resolve-search";
import { resetLogFileCandidateState as resetLogFileCandidateStateValue } from "./useSessionFiles-log-resolve-state";
import { useSessionFilesRequestActions } from "./useSessionFiles-request-actions";
import { useSessionFilesSearchActions } from "./useSessionFiles-search-actions";
import { useSessionFilesSearchEffects } from "./useSessionFiles-search-effects";
import { useSessionFilesSearchExpandState } from "./useSessionFiles-search-expand-state";
import { useSessionFilesTreeActions } from "./useSessionFiles-tree-actions";
import { useSessionFilesTreeLoader } from "./useSessionFiles-tree-loader";
import { useSessionFilesTreeRenderNodes } from "./useSessionFiles-tree-render-nodes";
import { useSessionFilesTreeReveal } from "./useSessionFiles-tree-reveal";
import { useSessionFilesUiSetters } from "./useSessionFiles-ui-setters";
import {
  createInitialSessionFilesUiState,
  reduceSessionFilesUiState,
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
    options?: { cursor?: string; limit?: number; worktreePath?: string },
  ) => Promise<RepoFileSearchPage>;
  requestRepoFileContent: (
    paneId: string,
    path: string,
    options?: { maxBytes?: number; worktreePath?: string },
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
  const [uiState, dispatchUiState] = useReducer(
    reduceSessionFilesUiState,
    undefined,
    createInitialSessionFilesUiState,
  );
  const {
    setSelectedFilePath,
    setSearchQuery,
    setSearchResult,
    setSearchLoading,
    setSearchError,
    setSearchActiveIndex,
    setFileModalOpen,
    setFileModalPath,
    setFileModalLoading,
    setFileModalError,
    setFileModalFile,
    setFileModalMarkdownViewMode,
    setFileModalShowLineNumbers,
    setFileModalCopiedPath,
    setFileModalCopyError,
    setFileModalHighlightLine,
    setFileResolveError,
    setLogFileCandidateModalOpen,
    setLogFileCandidateReference,
    setLogFileCandidatePaneId,
    setLogFileCandidateLine,
    setLogFileCandidateItems,
  } = useSessionFilesUiSetters(dispatchUiState);

  const {
    selectedFilePath,
    searchQuery,
    searchResult,
    searchLoading,
    searchError,
    searchActiveIndex,
    fileModalOpen,
    fileModalPath,
    fileModalLoading,
    fileModalError,
    fileModalFile,
    fileModalMarkdownViewMode,
    fileModalShowLineNumbers,
    fileModalCopiedPath,
    fileModalCopyError,
    fileModalHighlightLine,
    fileResolveError,
    logFileCandidateModalOpen,
    logFileCandidateReference,
    logFileCandidatePaneId,
    logFileCandidateLine,
    logFileCandidateItems,
  } = uiState;

  const [expandedDirSet, setExpandedDirSet] = useState<Set<string>>(new Set());
  const [searchExpandedDirSet, setSearchExpandedDirSet] = useState<Set<string>>(new Set());
  const [searchCollapsedDirSet, setSearchCollapsedDirSet] = useState<Set<string>>(new Set());
  const [treePages, setTreePages] = useState<Record<string, RepoFileTreePage>>({});
  const [treeLoadingByPath, setTreeLoadingByPath] = useState<Record<string, boolean>>({});
  const [treeError, setTreeError] = useState<string | null>(null);

  const treePageRequestMapRef = useRef(new Map<string, Promise<RepoFileTreePage>>());
  const searchRequestMapRef = useRef(new Map<string, Promise<RepoFileSearchPage>>());
  const fileContentRequestMapRef = useRef(new Map<string, Promise<RepoFileContent>>());
  const activeSearchRequestIdRef = useRef(0);
  const activeFileContentRequestIdRef = useRef(0);
  const activeLogResolveRequestIdRef = useRef(0);
  const logReferenceLinkableCacheRef = useRef(new Map<string, boolean>());
  const logReferenceLinkableRequestMapRef = useRef(new Map<string, Promise<boolean>>());
  const contextVersionRef = useRef(0);
  const treePagesRef = useRef<Record<string, RepoFileTreePage>>({});
  const fileModalCopyTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    treePagesRef.current = treePages;
  }, [treePages]);

  const resolveWorktreePathForPane = useCallback(
    (targetPaneId: string) => (targetPaneId === paneId ? (worktreePath ?? undefined) : undefined),
    [paneId, worktreePath],
  );

  const { loadTree } = useSessionFilesTreeLoader({
    paneId,
    requestScopeId,
    repoRoot,
    worktreePath,
    treePageLimit: TREE_PAGE_LIMIT,
    requestRepoFileTree,
    treePageRequestMapRef,
    contextVersionRef,
    setTreeLoadingByPath,
    setTreePages,
    setTreeError,
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

  useSessionFilesContextResetEffect({
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
    fileModalCopyTimeoutRef,
    setSelectedFilePath,
    setExpandedDirSet,
    setSearchExpandedDirSet,
    setSearchCollapsedDirSet,
    setTreePages,
    setTreeLoadingByPath,
    setTreeError,
    setSearchQuery,
    setSearchResult,
    setSearchLoading,
    setSearchError,
    setSearchActiveIndex,
    setFileModalOpen,
    setFileModalPath,
    setFileModalLoading,
    setFileModalError,
    setFileModalFile,
    setFileModalMarkdownViewMode,
    setFileModalShowLineNumbers,
    setFileModalCopiedPath,
    setFileModalCopyError,
    setFileModalHighlightLine,
    setFileResolveError,
    setLogFileCandidateModalOpen,
    setLogFileCandidateReference,
    setLogFileCandidatePaneId,
    setLogFileCandidateLine,
    setLogFileCandidateItems,
  });

  const resolveSearchErrorMessage = useCallback(
    (error: unknown) => resolveUnknownErrorMessage(error, API_ERROR_MESSAGES.fileSearch),
    [],
  );

  useSessionFilesSearchEffects({
    repoRoot,
    searchQuery,
    searchResult,
    searchDebounceMs: SEARCH_DEBOUNCE_MS,
    activeSearchRequestIdRef,
    fetchSearchPage,
    resolveSearchErrorMessage,
    setSearchExpandedDirSet,
    setSearchCollapsedDirSet,
    setSearchResult,
    setSearchLoading,
    setSearchError,
    setSearchActiveIndex,
  });

  const { revealFilePath } = useSessionFilesTreeReveal({
    repoRoot,
    treePagesRef,
    loadTree,
    setExpandedDirSet,
  });

  const { searchExpandPlan, effectiveSearchExpandedDirSet, isSearchActive } =
    useSessionFilesSearchExpandState({
      searchResult,
      searchActiveIndex,
      autoExpandMatchLimit,
      searchExpandedDirSet,
      searchCollapsedDirSet,
      searchQuery,
    });

  const { onToggleDirectory, onLoadMoreTreeRoot } = useSessionFilesTreeActions({
    isSearchActive,
    effectiveSearchExpandedDirSet,
    expandedDirSet,
    treePages,
    setSearchExpandedDirSet,
    setSearchCollapsedDirSet,
    setExpandedDirSet,
    treePagesRef,
    loadTree,
  });

  const onSelectFile = useCallback(
    (targetPath: string) => {
      setSelectedFilePath(targetPath);
      revealFilePath(targetPath);
    },
    [revealFilePath, setSelectedFilePath],
  );

  const {
    openFileModalByPath,
    onOpenFileModal,
    onCloseFileModal,
    onSetFileModalMarkdownViewMode,
    onToggleFileModalLineNumbers,
    onCopyFileModalPath,
  } = useSessionFilesFileModalActions({
    paneId,
    fileModalPath,
    fetchFileContent,
    revealFilePath,
    resolveUnknownErrorMessage,
    contextVersionRef,
    activeFileContentRequestIdRef,
    fileModalCopyTimeoutRef,
    setSelectedFilePath,
    setFileModalOpen,
    setFileModalPath,
    setFileModalLoading,
    setFileModalError,
    setFileModalShowLineNumbers,
    setFileModalCopyError,
    setFileModalCopiedPath,
    setFileModalFile,
    setFileModalHighlightLine,
    setFileModalMarkdownViewMode,
  });

  const { onSearchMove, onSearchConfirm, onLoadMoreSearch } = useSessionFilesSearchActions({
    searchResult,
    searchActiveIndex,
    searchLoading,
    fetchSearchPage,
    resolveUnknownErrorMessage,
    activeSearchRequestIdRef,
    setSearchActiveIndex,
    setSearchResult,
    setSearchLoading,
    setSearchError,
    onToggleDirectory,
    onSelectFile,
    onOpenFileModal,
  });

  const onRefresh = useCallback(() => {
    if (!repoRoot) {
      return;
    }
    void loadTree(".");

    const normalizedQuery = searchQuery.trim();
    if (normalizedQuery.length === 0) {
      return;
    }
    const requestId = createNextSearchRequestId(activeSearchRequestIdRef);
    setSearchLoading(true);
    setSearchError(null);
    void fetchSearchPage(normalizedQuery)
      .then((nextPage) => {
        if (activeSearchRequestIdRef.current !== requestId) {
          return;
        }
        setSearchResult(nextPage);
        setSearchActiveIndex(0);
      })
      .catch((error) => {
        if (activeSearchRequestIdRef.current !== requestId) {
          return;
        }
        setSearchError(resolveSearchErrorMessage(error));
      })
      .finally(() => {
        if (activeSearchRequestIdRef.current !== requestId) {
          return;
        }
        setSearchLoading(false);
      });
  }, [
    activeSearchRequestIdRef,
    fetchSearchPage,
    loadTree,
    repoRoot,
    resolveSearchErrorMessage,
    searchQuery,
    setSearchActiveIndex,
    setSearchError,
    setSearchLoading,
    setSearchResult,
  ]);

  const resetLogFileCandidateState = useCallback(() => {
    resetLogFileCandidateStateValue({
      setLogFileCandidateModalOpen,
      setLogFileCandidateReference,
      setLogFileCandidatePaneId,
      setLogFileCandidateLine,
      setLogFileCandidateItems,
    });
  }, [
    setLogFileCandidateItems,
    setLogFileCandidateLine,
    setLogFileCandidateModalOpen,
    setLogFileCandidatePaneId,
    setLogFileCandidateReference,
  ]);

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
    useSessionFilesLogResolveActions({
      paneId,
      logFileResolveMatchLimit: LOG_FILE_RESOLVE_MATCH_LIMIT,
      logFileResolvePageLimit: LOG_FILE_RESOLVE_PAGE_LIMIT,
      activeLogResolveRequestIdRef,
      logFileCandidatePaneId,
      logFileCandidateLine,
      setFileResolveError,
      setLogFileCandidateModalOpen,
      setLogFileCandidateReference,
      setLogFileCandidatePaneId,
      setLogFileCandidateLine,
      setLogFileCandidateItems,
      findExactNameMatches,
      tryOpenExistingPath,
      openFileModalByPath,
      resetLogFileCandidateState,
    });

  const clearFileModalCopyTimeout = useCallback(() => {
    const copyTimeoutId = fileModalCopyTimeoutRef.current;
    if (copyTimeoutId != null) {
      window.clearTimeout(copyTimeoutId);
      fileModalCopyTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => clearFileModalCopyTimeout, [clearFileModalCopyTimeout]);

  const { treeNodes, rootTreeHasMore } = useSessionFilesTreeRenderNodes({
    isSearchActive,
    searchResult,
    searchActiveIndex,
    selectedFilePath,
    effectiveSearchExpandedDirSet,
    treePages,
    expandedDirSet,
  });

  return {
    unavailable: !repoRoot,
    selectedFilePath,
    searchQuery,
    searchActiveIndex,
    searchResult,
    searchLoading,
    searchError,
    searchMode: searchExpandPlan.mode,
    treeLoading: Boolean(treeLoadingByPath["."]),
    treeError,
    treeNodes,
    rootTreeHasMore,
    searchHasMore: Boolean(searchResult?.nextCursor),
    fileModalOpen,
    fileModalPath,
    fileModalLoading,
    fileModalError,
    fileModalFile,
    fileModalMarkdownViewMode,
    fileModalShowLineNumbers,
    fileModalCopiedPath,
    fileModalCopyError,
    fileModalHighlightLine,
    fileResolveError,
    logFileCandidateModalOpen,
    logFileCandidateReference,
    logFileCandidatePaneId,
    logFileCandidateItems,
    onRefresh,
    onSearchQueryChange: setSearchQuery,
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
