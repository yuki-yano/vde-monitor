import type { RepoFileContent, RepoFileSearchPage, RepoFileTreePage } from "@vde-monitor/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { API_ERROR_MESSAGES } from "@/lib/api-messages";

import { buildSearchExpandPlan } from "../file-tree-search-expand";
import { extractLogReferenceLocation, normalizeLogReference } from "../log-file-reference";
import { useSessionFilesFileModalActions } from "./useSessionFiles-file-modal-actions";
import {
  buildLogReferenceLinkableCacheKey,
  resolveLogReferenceLinkableWithCache,
} from "./useSessionFiles-log-linkable-cache";
import {
  initializeLogResolveRequest,
  isCurrentLogResolveRequest,
  type LogFileCandidateItem,
  openLogFileCandidateModalState,
  resetLogFileCandidateState as resetLogFileCandidateStateValue,
  setLogResolveErrorIfCurrent,
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

  const findExactNameMatches = useCallback(
    async ({
      paneId: targetPaneId,
      filename,
      maxMatches,
      limitPerPage,
      requestId,
    }: {
      paneId: string;
      filename: string;
      maxMatches: number;
      limitPerPage: number;
      requestId?: number;
    }): Promise<LogFileCandidateItem[] | null> => {
      const matches: LogFileCandidateItem[] = [];
      const knownPaths = new Set<string>();
      let cursor: string | undefined = undefined;

      while (matches.length < maxMatches) {
        if (requestId != null && activeLogResolveRequestIdRef.current !== requestId) {
          return null;
        }
        const page = await requestRepoFileSearch(targetPaneId, filename, {
          cursor,
          limit: limitPerPage,
        });
        if (requestId != null && activeLogResolveRequestIdRef.current !== requestId) {
          return null;
        }
        page.items.forEach((item) => {
          if (item.kind !== "file" || item.name !== filename || knownPaths.has(item.path)) {
            return;
          }
          knownPaths.add(item.path);
          matches.push({
            path: item.path,
            name: item.name,
            isIgnored: item.isIgnored,
          });
        });
        if (!page.nextCursor) {
          break;
        }
        cursor = page.nextCursor;
      }

      return matches.slice(0, maxMatches);
    },
    [requestRepoFileSearch],
  );

  const hasExactPathMatch = useCallback(
    async ({
      paneId: targetPaneId,
      path,
      limitPerPage,
      requestId,
    }: {
      paneId: string;
      path: string;
      limitPerPage: number;
      requestId?: number;
    }): Promise<boolean | null> => {
      let cursor: string | undefined = undefined;
      let pageCount = 0;
      const visitedCursors = new Set<string>();

      while (pageCount < LOG_FILE_RESOLVE_MAX_SEARCH_PAGES) {
        if (requestId != null && activeLogResolveRequestIdRef.current !== requestId) {
          return null;
        }
        const page = await requestRepoFileSearch(targetPaneId, path, {
          cursor,
          limit: limitPerPage,
        });
        pageCount += 1;
        if (requestId != null && activeLogResolveRequestIdRef.current !== requestId) {
          return null;
        }

        const hasMatch = page.items.some((item) => item.kind === "file" && item.path === path);
        if (hasMatch) {
          return true;
        }

        if (!page.nextCursor) {
          return false;
        }
        if (visitedCursors.has(page.nextCursor)) {
          return false;
        }
        visitedCursors.add(page.nextCursor);
        cursor = page.nextCursor;
      }

      return false;
    },
    [requestRepoFileSearch],
  );

  const isLogFileReferenceLinkable = useCallback(
    async ({
      rawToken,
      sourcePaneId,
      sourceRepoRoot,
    }: {
      rawToken: string;
      sourcePaneId: string;
      sourceRepoRoot: string | null;
    }): Promise<boolean> => {
      if (sourcePaneId.trim().length === 0) {
        return false;
      }
      const reference = normalizeLogReference(rawToken, {
        sourceRepoRoot,
      });
      if (reference.kind === "unknown") {
        return false;
      }
      const cacheKey = buildLogReferenceLinkableCacheKey({
        sourcePaneId,
        sourceRepoRoot,
        kind: reference.kind,
        normalizedPath: reference.normalizedPath,
        filename: reference.filename,
        display: reference.display,
      });
      return resolveLogReferenceLinkableWithCache({
        cacheRef: logReferenceLinkableCacheRef,
        requestMapRef: logReferenceLinkableRequestMapRef,
        cacheKey,
        cacheMaxSize: LOG_REFERENCE_LINKABLE_CACHE_MAX,
        resolve: async () => {
          if (reference.normalizedPath) {
            try {
              const pathMatched = await hasExactPathMatch({
                paneId: sourcePaneId,
                path: reference.normalizedPath,
                limitPerPage: LOG_FILE_RESOLVE_PAGE_LIMIT,
              });
              if (pathMatched === true) {
                return true;
              }
            } catch {
              // path resolve failed; continue to filename fallback
            }
          }

          if (!reference.filename) {
            return false;
          }

          try {
            const matches = await findExactNameMatches({
              paneId: sourcePaneId,
              filename: reference.filename,
              maxMatches: 1,
              limitPerPage: LOG_FILE_RESOLVE_PAGE_LIMIT,
            });
            return (matches?.length ?? 0) > 0;
          } catch {
            return false;
          }
        },
      });
    },
    [findExactNameMatches, hasExactPathMatch],
  );

  const onResolveLogFileReferenceCandidates = useCallback(
    async ({
      rawTokens,
      sourcePaneId,
      sourceRepoRoot,
    }: {
      rawTokens: string[];
      sourcePaneId: string;
      sourceRepoRoot: string | null;
    }) => {
      const uniqueTokens = Array.from(
        new Set(rawTokens.filter((token) => token.trim().length > 0)),
      );
      if (uniqueTokens.length === 0 || sourcePaneId.trim().length === 0) {
        return [] as string[];
      }

      const linkableRawTokenSet = new Set<string>();
      const pendingRawTokens: string[] = [];

      uniqueTokens.forEach((rawToken) => {
        const reference = normalizeLogReference(rawToken, {
          sourceRepoRoot,
        });
        if (reference.kind === "unknown") {
          return;
        }
        const cacheKey = buildLogReferenceLinkableCacheKey({
          sourcePaneId,
          sourceRepoRoot,
          kind: reference.kind,
          normalizedPath: reference.normalizedPath,
          filename: reference.filename,
          display: reference.display,
        });
        const cached = logReferenceLinkableCacheRef.current.get(cacheKey);
        if (cached != null) {
          if (cached) {
            linkableRawTokenSet.add(rawToken);
          }
          return;
        }
        pendingRawTokens.push(rawToken);
      });

      if (pendingRawTokens.length > 0) {
        const resolvedTokens = await Promise.all(
          pendingRawTokens.map(async (rawToken) => {
            try {
              const linkable = await isLogFileReferenceLinkable({
                rawToken,
                sourcePaneId,
                sourceRepoRoot,
              });
              return linkable ? rawToken : null;
            } catch {
              return null;
            }
          }),
        );
        resolvedTokens.forEach((rawToken) => {
          if (rawToken) {
            linkableRawTokenSet.add(rawToken);
          }
        });
      }

      return uniqueTokens.filter((token) => linkableRawTokenSet.has(token));
    },
    [isLogFileReferenceLinkable],
  );

  const tryOpenExistingPath = useCallback(
    async ({
      paneId: targetPaneId,
      path,
      requestId,
      highlightLine,
    }: {
      paneId: string;
      path: string;
      requestId: number;
      highlightLine?: number | null;
    }) => {
      try {
        const exists = await hasExactPathMatch({
          paneId: targetPaneId,
          path,
          requestId,
          limitPerPage: LOG_FILE_RESOLVE_PAGE_LIMIT,
        });
        if (!exists) {
          return false;
        }
      } catch {
        return false;
      }
      if (activeLogResolveRequestIdRef.current !== requestId) {
        return false;
      }
      openFileModalByPath(path, {
        paneId: targetPaneId,
        origin: "log",
        highlightLine,
      });
      return true;
    },
    [hasExactPathMatch, openFileModalByPath],
  );

  const onResolveLogFileReference = useCallback(
    async ({
      rawToken,
      sourcePaneId,
      sourceRepoRoot,
    }: {
      rawToken: string;
      sourcePaneId: string;
      sourceRepoRoot: string | null;
    }) => {
      const requestId = initializeLogResolveRequest({
        activeLogResolveRequestIdRef,
        setFileResolveError,
        setLogFileCandidateModalOpen,
        setLogFileCandidateReference,
        setLogFileCandidatePaneId,
        setLogFileCandidateLine,
        setLogFileCandidateItems,
      });

      if (sourcePaneId.trim().length === 0) {
        setLogResolveErrorIfCurrent({
          activeLogResolveRequestIdRef,
          requestId,
          setFileResolveError,
          message: "Session context is unavailable.",
        });
        return;
      }

      const location = extractLogReferenceLocation(rawToken);
      const reference = normalizeLogReference(rawToken, { sourceRepoRoot });
      if (reference.kind === "unknown") {
        setLogResolveErrorIfCurrent({
          activeLogResolveRequestIdRef,
          requestId,
          setFileResolveError,
          message: "No file reference found in token.",
        });
        return;
      }

      if (reference.normalizedPath) {
        const opened = await tryOpenExistingPath({
          paneId: sourcePaneId,
          path: reference.normalizedPath,
          requestId,
          highlightLine: location.line,
        });
        if (
          !isCurrentLogResolveRequest({
            activeLogResolveRequestIdRef,
            requestId,
          })
        ) {
          return;
        }
        if (opened) {
          return;
        }
      }

      if (!reference.filename) {
        setLogResolveErrorIfCurrent({
          activeLogResolveRequestIdRef,
          requestId,
          setFileResolveError,
          message: "File not found.",
        });
        return;
      }

      let matches: LogFileCandidateItem[] | null = null;
      try {
        matches = await findExactNameMatches({
          paneId: sourcePaneId,
          filename: reference.filename,
          maxMatches: LOG_FILE_RESOLVE_MATCH_LIMIT,
          limitPerPage: LOG_FILE_RESOLVE_PAGE_LIMIT,
          requestId,
        });
      } catch {
        setLogResolveErrorIfCurrent({
          activeLogResolveRequestIdRef,
          requestId,
          setFileResolveError,
          message: "Failed to resolve file reference.",
        });
        return;
      }

      if (
        !isCurrentLogResolveRequest({
          activeLogResolveRequestIdRef,
          requestId,
        }) ||
        matches == null
      ) {
        return;
      }

      if (matches.length === 0) {
        setLogResolveErrorIfCurrent({
          activeLogResolveRequestIdRef,
          requestId,
          setFileResolveError,
          message: `No file matched: ${reference.filename}`,
        });
        return;
      }
      if (matches.length === 1 && matches[0]) {
        openFileModalByPath(matches[0].path, {
          paneId: sourcePaneId,
          origin: "log",
          highlightLine: location.line,
        });
        return;
      }

      openLogFileCandidateModalState({
        setLogFileCandidateModalOpen,
        setLogFileCandidateReference,
        setLogFileCandidatePaneId,
        setLogFileCandidateLine,
        setLogFileCandidateItems,
        reference: reference.display,
        paneId: sourcePaneId,
        line: location.line,
        items: matches,
      });
    },
    [
      activeLogResolveRequestIdRef,
      findExactNameMatches,
      openFileModalByPath,
      setFileResolveError,
      setLogFileCandidateItems,
      setLogFileCandidateLine,
      setLogFileCandidateModalOpen,
      setLogFileCandidatePaneId,
      setLogFileCandidateReference,
      tryOpenExistingPath,
    ],
  );

  const onSelectLogFileCandidate = useCallback(
    (path: string) => {
      const targetPaneId = logFileCandidatePaneId ?? paneId;
      const targetLine = logFileCandidateLine;
      resetLogFileCandidateState();
      openFileModalByPath(path, {
        paneId: targetPaneId,
        origin: "log",
        highlightLine: targetLine,
      });
    },
    [
      logFileCandidateLine,
      logFileCandidatePaneId,
      openFileModalByPath,
      paneId,
      resetLogFileCandidateState,
    ],
  );

  const onCloseLogFileCandidateModal = useCallback(() => {
    resetLogFileCandidateState();
  }, [resetLogFileCandidateState]);

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
