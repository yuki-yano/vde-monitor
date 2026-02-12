import type { RepoFileContent, RepoFileSearchPage, RepoFileTreePage } from "@vde-monitor/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { API_ERROR_MESSAGES } from "@/lib/api-messages";

import { buildSearchExpandPlan } from "../file-tree-search-expand";
import { useSessionFilesFileModalActions } from "./useSessionFiles-file-modal-actions";
import { useSessionFilesLogLinkableActions } from "./useSessionFiles-log-linkable-actions";
import { useSessionFilesLogResolveActions } from "./useSessionFiles-log-resolve-actions";
import { useSessionFilesLogResolveSearch } from "./useSessionFiles-log-resolve-search";
import {
  type LogFileCandidateItem,
  resetLogFileCandidateState as resetLogFileCandidateStateValue,
} from "./useSessionFiles-log-resolve-state";
import {
  buildFileContentRequestKey,
  buildSearchRequestKey,
  fetchWithRequestMap,
} from "./useSessionFiles-request-cache";
import { resetSessionFilesRefs, resetSessionFilesState } from "./useSessionFiles-reset";
import { useSessionFilesSearchActions } from "./useSessionFiles-search-actions";
import {
  applyEmptySearchState,
  createNextSearchRequestId,
  resetSearchExpandOverrides,
  scheduleSearchRequest,
} from "./useSessionFiles-search-effect";
import { useSessionFilesTreeActions } from "./useSessionFiles-tree-actions";
import { useSessionFilesTreeLoader } from "./useSessionFiles-tree-loader";
import { useSessionFilesTreeReveal } from "./useSessionFiles-tree-reveal";
import {
  buildNormalRenderNodes,
  buildSearchRenderNodes,
  resolveTreeLoadMoreTarget,
} from "./useSessionFiles-tree-utils";

const TREE_PAGE_LIMIT = 200;
const SEARCH_PAGE_LIMIT = 100;
const SEARCH_DEBOUNCE_MS = 120;
const FILE_CONTENT_MAX_BYTES = 256 * 1024;
const LOG_FILE_RESOLVE_MATCH_LIMIT = 20;
const LOG_FILE_RESOLVE_PAGE_LIMIT = 100;
const LOG_FILE_RESOLVE_MAX_SEARCH_PAGES = 20;
const LOG_REFERENCE_LINKABLE_CACHE_MAX = 1000;

export type { FileTreeRenderNode } from "./useSessionFiles-tree-utils";

type UseSessionFilesParams = {
  paneId: string;
  repoRoot: string | null;
  autoExpandMatchLimit: number;
  requestRepoFileTree: (
    paneId: string,
    options?: { path?: string; cursor?: string; limit?: number },
  ) => Promise<RepoFileTreePage>;
  requestRepoFileSearch: (
    paneId: string,
    query: string,
    options?: { cursor?: string; limit?: number },
  ) => Promise<RepoFileSearchPage>;
  requestRepoFileContent: (
    paneId: string,
    path: string,
    options?: { maxBytes?: number },
  ) => Promise<RepoFileContent>;
};

const resolveUnknownErrorMessage = (error: unknown, fallbackMessage: string) =>
  error instanceof Error ? error.message : fallbackMessage;

export const useSessionFiles = ({
  paneId,
  repoRoot,
  autoExpandMatchLimit,
  requestRepoFileTree,
  requestRepoFileSearch,
  requestRepoFileContent,
}: UseSessionFilesParams) => {
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [expandedDirSet, setExpandedDirSet] = useState<Set<string>>(new Set());
  const [searchExpandedDirSet, setSearchExpandedDirSet] = useState<Set<string>>(new Set());
  const [searchCollapsedDirSet, setSearchCollapsedDirSet] = useState<Set<string>>(new Set());
  const [treePages, setTreePages] = useState<Record<string, RepoFileTreePage>>({});
  const [treeLoadingByPath, setTreeLoadingByPath] = useState<Record<string, boolean>>({});
  const [treeError, setTreeError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResult, setSearchResult] = useState<RepoFileSearchPage | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchActiveIndex, setSearchActiveIndex] = useState(0);
  const [fileModalOpen, setFileModalOpen] = useState(false);
  const [fileModalPath, setFileModalPath] = useState<string | null>(null);
  const [fileModalLoading, setFileModalLoading] = useState(false);
  const [fileModalError, setFileModalError] = useState<string | null>(null);
  const [fileModalFile, setFileModalFile] = useState<RepoFileContent | null>(null);
  const [fileModalMarkdownViewMode, setFileModalMarkdownViewMode] = useState<"code" | "preview">(
    "code",
  );
  const [fileModalShowLineNumbers, setFileModalShowLineNumbers] = useState(true);
  const [fileModalCopiedPath, setFileModalCopiedPath] = useState(false);
  const [fileModalCopyError, setFileModalCopyError] = useState<string | null>(null);
  const [fileModalHighlightLine, setFileModalHighlightLine] = useState<number | null>(null);
  const [fileResolveError, setFileResolveError] = useState<string | null>(null);
  const [logFileCandidateModalOpen, setLogFileCandidateModalOpen] = useState(false);
  const [logFileCandidateReference, setLogFileCandidateReference] = useState<string | null>(null);
  const [logFileCandidatePaneId, setLogFileCandidatePaneId] = useState<string | null>(null);
  const [logFileCandidateLine, setLogFileCandidateLine] = useState<number | null>(null);
  const [logFileCandidateItems, setLogFileCandidateItems] = useState<LogFileCandidateItem[]>([]);

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

  const { loadTree } = useSessionFilesTreeLoader({
    paneId,
    repoRoot,
    treePageLimit: TREE_PAGE_LIMIT,
    requestRepoFileTree,
    treePageRequestMapRef,
    contextVersionRef,
    setTreeLoadingByPath,
    setTreePages,
    setTreeError,
    resolveUnknownErrorMessage,
  });

  const fetchSearchPage = useCallback(
    async (query: string, cursor?: string) => {
      return fetchWithRequestMap({
        requestMapRef: searchRequestMapRef,
        requestKey: buildSearchRequestKey(paneId, query, cursor),
        requestFactory: () =>
          requestRepoFileSearch(paneId, query, { cursor, limit: SEARCH_PAGE_LIMIT }),
      });
    },
    [paneId, requestRepoFileSearch],
  );

  const fetchFileContent = useCallback(
    async (targetPaneId: string, targetPath: string) => {
      return fetchWithRequestMap({
        requestMapRef: fileContentRequestMapRef,
        requestKey: buildFileContentRequestKey(targetPaneId, targetPath, FILE_CONTENT_MAX_BYTES),
        requestFactory: () =>
          requestRepoFileContent(targetPaneId, targetPath, {
            maxBytes: FILE_CONTENT_MAX_BYTES,
          }),
      });
    },
    [requestRepoFileContent],
  );

  useEffect(() => {
    resetSessionFilesRefs({
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
    });
    resetSessionFilesState({
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

    if (!repoRoot) {
      return;
    }
    void loadTree(".");
  }, [loadTree, paneId, repoRoot]);

  useEffect(() => {
    if (!repoRoot) {
      return;
    }
    const normalized = searchQuery.trim();
    const requestId = createNextSearchRequestId(activeSearchRequestIdRef);
    resetSearchExpandOverrides({
      setSearchExpandedDirSet,
      setSearchCollapsedDirSet,
    });
    if (normalized.length === 0) {
      applyEmptySearchState({
        setSearchResult,
        setSearchError,
        setSearchLoading,
        setSearchActiveIndex,
      });
      return;
    }

    const timerId = scheduleSearchRequest({
      requestId,
      activeSearchRequestIdRef,
      normalizedQuery: normalized,
      debounceMs: SEARCH_DEBOUNCE_MS,
      fetchSearchPage,
      resolveErrorMessage: (error) =>
        resolveUnknownErrorMessage(error, API_ERROR_MESSAGES.fileSearch),
      setSearchLoading,
      setSearchError,
      setSearchResult,
      setSearchActiveIndex,
    });

    return () => {
      window.clearTimeout(timerId);
    };
  }, [fetchSearchPage, repoRoot, searchQuery]);

  useEffect(() => {
    if (!searchResult) {
      return;
    }
    if (searchResult.items.length === 0) {
      setSearchActiveIndex(0);
      return;
    }
    setSearchActiveIndex((prev) => {
      if (prev < 0) {
        return 0;
      }
      if (prev >= searchResult.items.length) {
        return searchResult.items.length - 1;
      }
      return prev;
    });
  }, [searchResult]);

  const { revealFilePath } = useSessionFilesTreeReveal({
    repoRoot,
    treePagesRef,
    loadTree,
    setExpandedDirSet,
  });

  const searchExpandPlan = useMemo(
    () =>
      buildSearchExpandPlan({
        matchedPaths: searchResult?.items.map((item) => item.path) ?? [],
        activeIndex: searchActiveIndex,
        autoExpandMatchLimit,
        truncated: searchResult?.truncated ?? false,
        totalMatchedCount: searchResult?.totalMatchedCount ?? 0,
      }),
    [autoExpandMatchLimit, searchActiveIndex, searchResult],
  );

  const effectiveSearchExpandedDirSet = useMemo(() => {
    const merged = new Set(searchExpandPlan.expandedDirSet);
    searchExpandedDirSet.forEach((path) => merged.add(path));
    searchCollapsedDirSet.forEach((path) => merged.delete(path));
    return merged;
  }, [searchCollapsedDirSet, searchExpandPlan.expandedDirSet, searchExpandedDirSet]);

  const isSearchActive = searchQuery.trim().length > 0;

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
    [revealFilePath],
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

  const resetLogFileCandidateState = useCallback(() => {
    resetLogFileCandidateStateValue({
      setLogFileCandidateModalOpen,
      setLogFileCandidateReference,
      setLogFileCandidatePaneId,
      setLogFileCandidateLine,
      setLogFileCandidateItems,
    });
  }, []);

  const { hasExactPathMatch, findExactNameMatches, tryOpenExistingPath } =
    useSessionFilesLogResolveSearch({
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

  const searchActivePath = searchResult?.items[searchActiveIndex]?.path ?? null;
  const searchTreeNodes = useMemo(
    () =>
      buildSearchRenderNodes({
        searchItems: searchResult?.items ?? [],
        selectedFilePath,
        activeMatchPath: searchActivePath,
        expandedDirSet: effectiveSearchExpandedDirSet,
      }),
    [effectiveSearchExpandedDirSet, searchActivePath, searchResult?.items, selectedFilePath],
  );

  const normalTreeNodes = useMemo(
    () =>
      buildNormalRenderNodes({
        treePages,
        expandedDirSet,
        selectedFilePath,
      }),
    [expandedDirSet, selectedFilePath, treePages],
  );

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
    treeNodes: isSearchActive ? searchTreeNodes : normalTreeNodes,
    rootTreeHasMore:
      resolveTreeLoadMoreTarget({
        treePages,
        expandedDirSet,
      }) != null,
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

export type SessionFilesViewModel = ReturnType<typeof useSessionFiles>;
