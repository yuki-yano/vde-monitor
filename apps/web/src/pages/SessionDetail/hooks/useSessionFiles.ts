import type { RepoFileContent, RepoFileSearchPage, RepoFileTreePage } from "@vde-monitor/shared";
import { useCallback, useEffect, useRef, useState } from "react";

import { API_ERROR_MESSAGES } from "@/lib/api-messages";

import { useSessionFilesContextResetEffect } from "./useSessionFiles-context-reset-effect";
import { useSessionFilesFileModalActions } from "./useSessionFiles-file-modal-actions";
import { useSessionFilesLogLinkableActions } from "./useSessionFiles-log-linkable-actions";
import { useSessionFilesLogResolveActions } from "./useSessionFiles-log-resolve-actions";
import { useSessionFilesLogResolveSearch } from "./useSessionFiles-log-resolve-search";
import {
  type LogFileCandidateItem,
  resetLogFileCandidateState as resetLogFileCandidateStateValue,
} from "./useSessionFiles-log-resolve-state";
import { useSessionFilesRequestActions } from "./useSessionFiles-request-actions";
import { useSessionFilesSearchActions } from "./useSessionFiles-search-actions";
import { useSessionFilesSearchEffects } from "./useSessionFiles-search-effects";
import { useSessionFilesSearchExpandState } from "./useSessionFiles-search-expand-state";
import { useSessionFilesTreeActions } from "./useSessionFiles-tree-actions";
import { useSessionFilesTreeLoader } from "./useSessionFiles-tree-loader";
import { useSessionFilesTreeRenderNodes } from "./useSessionFiles-tree-render-nodes";
import { useSessionFilesTreeReveal } from "./useSessionFiles-tree-reveal";

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

const resolveUnknownErrorMessage = (error: unknown, fallbackMessage: string) =>
  error instanceof Error ? error.message : fallbackMessage;

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
  const [fileModalMarkdownViewMode, setFileModalMarkdownViewMode] = useState<
    "code" | "preview" | "diff"
  >("code");
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
