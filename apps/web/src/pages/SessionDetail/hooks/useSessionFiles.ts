import type {
  RepoFileContent,
  RepoFileNodeKind,
  RepoFileSearchPage,
  RepoFileTreeNode,
  RepoFileTreePage,
} from "@vde-monitor/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { API_ERROR_MESSAGES } from "@/lib/api-messages";

import { buildSearchExpandPlan } from "../file-tree-search-expand";

const TREE_PAGE_LIMIT = 200;
const SEARCH_PAGE_LIMIT = 100;
const SEARCH_DEBOUNCE_MS = 120;
const FILE_CONTENT_MAX_BYTES = 256 * 1024;

export type FileTreeRenderNode = {
  path: string;
  name: string;
  kind: RepoFileNodeKind;
  depth: number;
  selected: boolean;
  expanded: boolean;
  hasChildren: boolean;
  searchMatched: boolean;
  activeMatch: boolean;
  isIgnored: boolean;
};

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

const mergeTreeEntries = (existing: RepoFileTreeNode[], incoming: RepoFileTreeNode[]) => {
  const merged = new Map<string, RepoFileTreeNode>();
  existing.forEach((entry) => {
    merged.set(entry.path, entry);
  });
  incoming.forEach((entry) => {
    merged.set(entry.path, entry);
  });
  return Array.from(merged.values()).sort((left, right) => left.name.localeCompare(right.name));
};

const mergeSearchItems = (
  existing: RepoFileSearchPage["items"],
  incoming: RepoFileSearchPage["items"],
) => {
  const merged = [...existing];
  const knownPaths = new Set(existing.map((item) => item.path));
  incoming.forEach((item) => {
    if (knownPaths.has(item.path)) {
      return;
    }
    knownPaths.add(item.path);
    merged.push(item);
  });
  return merged;
};

const collectAncestorDirectories = (targetPath: string) => {
  const segments = targetPath.split("/").filter((segment) => segment.length > 0);
  if (segments.length <= 1) {
    return [];
  }
  const ancestors: string[] = [];
  let current = "";
  for (let i = 0; i < segments.length - 1; i += 1) {
    const segment = segments[i];
    if (!segment) {
      continue;
    }
    current = current.length > 0 ? `${current}/${segment}` : segment;
    ancestors.push(current);
  }
  return ancestors;
};

const markdownPathPattern = /\.(md|markdown)$/i;

const isMarkdownFileContent = (file: RepoFileContent) => {
  if (file.languageHint === "markdown") {
    return true;
  }
  return markdownPathPattern.test(file.path);
};

const copyTextToClipboard = async (value: string) => {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    try {
      return document.execCommand("copy");
    } catch {
      return false;
    } finally {
      document.body.removeChild(textarea);
    }
  }
};

const normalizeSearchTree = (items: RepoFileSearchPage["items"]) => {
  const nodeMap = new Map<
    string,
    {
      path: string;
      name: string;
      kind: RepoFileNodeKind;
      children: Set<string>;
      isIgnored: boolean;
    }
  >();
  const rootChildren = new Set<string>();

  const ensureNode = (
    nodePath: string,
    name: string,
    kind: RepoFileNodeKind,
    isIgnored: boolean,
  ) => {
    const existing = nodeMap.get(nodePath);
    if (existing) {
      if (kind === "file") {
        existing.isIgnored = isIgnored;
      }
      return existing;
    }
    const created = {
      path: nodePath,
      name,
      kind,
      children: new Set<string>(),
      isIgnored,
    };
    nodeMap.set(nodePath, created);
    return created;
  };

  items.forEach((item) => {
    const segments = item.path.split("/").filter((segment) => segment.length > 0);
    let parentPath: string | null = null;
    segments.forEach((segment, index) => {
      const currentPath = segments.slice(0, index + 1).join("/");
      const kind: RepoFileNodeKind =
        index === segments.length - 1 ? item.kind : "directory";
      const current = ensureNode(currentPath, segment, kind, kind === "file" && item.isIgnored === true);
      if (!parentPath) {
        rootChildren.add(current.path);
      } else {
        const parent = nodeMap.get(parentPath);
        if (parent) {
          parent.children.add(current.path);
        }
      }
      parentPath = current.path;
    });
  });

  return { nodeMap, rootChildren };
};

const buildSearchRenderNodes = ({
  searchItems,
  selectedFilePath,
  activeMatchPath,
  expandedDirSet,
}: {
  searchItems: RepoFileSearchPage["items"];
  selectedFilePath: string | null;
  activeMatchPath: string | null;
  expandedDirSet: Set<string>;
}): FileTreeRenderNode[] => {
  if (searchItems.length === 0) {
    return [];
  }

  const { nodeMap, rootChildren } = normalizeSearchTree(searchItems);
  const matchedPathSet = new Set(searchItems.map((item) => item.path));
  const ignoredMemo = new Map<string, boolean>();

  const resolveNodeIgnored = (nodePath: string): boolean => {
    const cached = ignoredMemo.get(nodePath);
    if (cached != null) {
      return cached;
    }
    const node = nodeMap.get(nodePath);
    if (!node) {
      ignoredMemo.set(nodePath, false);
      return false;
    }
    if (node.kind === "file") {
      ignoredMemo.set(nodePath, node.isIgnored);
      return node.isIgnored;
    }
    const childPaths = Array.from(node.children);
    if (childPaths.length === 0) {
      ignoredMemo.set(nodePath, false);
      return false;
    }
    const allChildrenIgnored = childPaths.every((childPath) => resolveNodeIgnored(childPath));
    ignoredMemo.set(nodePath, allChildrenIgnored);
    return allChildrenIgnored;
  };

  Array.from(rootChildren).forEach((rootPath) => {
    resolveNodeIgnored(rootPath);
  });

  const renderNodes: FileTreeRenderNode[] = [];
  const visit = (nodePath: string, depth: number) => {
    const node = nodeMap.get(nodePath);
    if (!node) {
      return;
    }
    const isDirectory = node.kind === "directory";
    const expanded = isDirectory && expandedDirSet.has(node.path);
    const childPaths = Array.from(node.children).sort((leftPath, rightPath) => {
      const leftNode = nodeMap.get(leftPath);
      const rightNode = nodeMap.get(rightPath);
      if (!leftNode || !rightNode) {
        return leftPath.localeCompare(rightPath);
      }
      return leftNode.name.localeCompare(rightNode.name);
    });
    renderNodes.push({
      path: node.path,
      name: node.name,
      kind: node.kind,
      depth,
      selected: node.path === selectedFilePath,
      expanded,
      hasChildren: childPaths.length > 0,
      searchMatched: matchedPathSet.has(node.path),
      activeMatch: node.path === activeMatchPath,
      isIgnored: ignoredMemo.get(node.path) ?? node.isIgnored,
    });
    if (!expanded) {
      return;
    }
    childPaths.forEach((childPath) => visit(childPath, depth + 1));
  };

  Array.from(rootChildren)
    .sort((leftPath, rightPath) => {
      const leftNode = nodeMap.get(leftPath);
      const rightNode = nodeMap.get(rightPath);
      if (!leftNode || !rightNode) {
        return leftPath.localeCompare(rightPath);
      }
      return leftNode.name.localeCompare(rightNode.name);
    })
    .forEach((rootPath) => visit(rootPath, 0));

  return renderNodes;
};

const buildNormalRenderNodes = ({
  treePages,
  expandedDirSet,
  selectedFilePath,
}: {
  treePages: Record<string, RepoFileTreePage>;
  expandedDirSet: Set<string>;
  selectedFilePath: string | null;
}) => {
  const renderNodes: FileTreeRenderNode[] = [];

  const appendEntries = (basePath: string, depth: number) => {
    const page = treePages[basePath];
    if (!page) {
      return;
    }
    page.entries.forEach((entry) => {
      const expanded = entry.kind === "directory" && expandedDirSet.has(entry.path);
      renderNodes.push({
        path: entry.path,
        name: entry.name,
        kind: entry.kind,
        depth,
        selected: entry.path === selectedFilePath,
        expanded,
        hasChildren: entry.kind === "directory" ? Boolean(entry.hasChildren) : false,
        searchMatched: false,
        activeMatch: false,
        isIgnored: entry.isIgnored === true,
      });
      if (entry.kind === "directory" && expanded) {
        appendEntries(entry.path, depth + 1);
      }
    });
  };

  appendEntries(".", 0);
  return renderNodes;
};

const resolveTreeLoadMoreTarget = ({
  treePages,
  expandedDirSet,
}: {
  treePages: Record<string, RepoFileTreePage>;
  expandedDirSet: Set<string>;
}) => {
  const candidates = Object.entries(treePages)
    .filter(([, page]) => page.nextCursor != null)
    .map(([path, page]) => ({
      path,
      cursor: page.nextCursor as string,
      priority: path === "." ? 0 : expandedDirSet.has(path) ? 1 : 2,
    }))
    .sort((left, right) => {
      const priorityDiff = left.priority - right.priority;
      if (priorityDiff !== 0) {
        return priorityDiff;
      }
      return left.path.localeCompare(right.path);
    });

  return candidates[0] ?? null;
};

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

  const treePageRequestMapRef = useRef(new Map<string, Promise<RepoFileTreePage>>());
  const searchRequestMapRef = useRef(new Map<string, Promise<RepoFileSearchPage>>());
  const fileContentRequestMapRef = useRef(new Map<string, Promise<RepoFileContent>>());
  const activeSearchRequestIdRef = useRef(0);
  const activeFileContentRequestIdRef = useRef(0);
  const contextVersionRef = useRef(0);
  const treePagesRef = useRef<Record<string, RepoFileTreePage>>({});
  const fileModalCopyTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    treePagesRef.current = treePages;
  }, [treePages]);

  const fetchTreePage = useCallback(
    async (targetPath: string, cursor?: string) => {
      const requestKey = `${paneId}:${targetPath}:${cursor ?? ""}`;
      const inFlight = treePageRequestMapRef.current.get(requestKey);
      if (inFlight) {
        return inFlight;
      }
      const request = requestRepoFileTree(paneId, {
        path: targetPath === "." ? undefined : targetPath,
        cursor,
        limit: TREE_PAGE_LIMIT,
      });
      treePageRequestMapRef.current.set(requestKey, request);
      try {
        return await request;
      } finally {
        treePageRequestMapRef.current.delete(requestKey);
      }
    },
    [paneId, requestRepoFileTree],
  );

  const loadTree = useCallback(
    async (targetPath: string, cursor?: string) => {
      if (!repoRoot) {
        return null;
      }
      const contextVersion = contextVersionRef.current;
      setTreeLoadingByPath((prev) => ({ ...prev, [targetPath]: true }));
      try {
        const page = await fetchTreePage(targetPath, cursor);
        if (contextVersion !== contextVersionRef.current) {
          return null;
        }
        setTreePages((prev) => {
          if (!cursor) {
            return { ...prev, [targetPath]: page };
          }
          const previous = prev[targetPath];
          if (!previous) {
            return { ...prev, [targetPath]: page };
          }
          const merged: RepoFileTreePage = {
            ...page,
            entries: mergeTreeEntries(previous.entries, page.entries),
          };
          return { ...prev, [targetPath]: merged };
        });
        setTreeError(null);
        return page;
      } catch (error) {
        if (contextVersion !== contextVersionRef.current) {
          return null;
        }
        setTreeError(resolveUnknownErrorMessage(error, API_ERROR_MESSAGES.fileTree));
        return null;
      } finally {
        if (contextVersion === contextVersionRef.current) {
          setTreeLoadingByPath((prev) => ({ ...prev, [targetPath]: false }));
        }
      }
    },
    [fetchTreePage, repoRoot],
  );

  const fetchSearchPage = useCallback(
    async (query: string, cursor?: string) => {
      const requestKey = `${paneId}:${query}:${cursor ?? ""}`;
      const inFlight = searchRequestMapRef.current.get(requestKey);
      if (inFlight) {
        return inFlight;
      }
      const request = requestRepoFileSearch(paneId, query, { cursor, limit: SEARCH_PAGE_LIMIT });
      searchRequestMapRef.current.set(requestKey, request);
      try {
        return await request;
      } finally {
        searchRequestMapRef.current.delete(requestKey);
      }
    },
    [paneId, requestRepoFileSearch],
  );

  const fetchFileContent = useCallback(
    async (targetPath: string) => {
      const requestKey = `${paneId}:${targetPath}:${FILE_CONTENT_MAX_BYTES}`;
      const inFlight = fileContentRequestMapRef.current.get(requestKey);
      if (inFlight) {
        return inFlight;
      }
      const request = requestRepoFileContent(paneId, targetPath, {
        maxBytes: FILE_CONTENT_MAX_BYTES,
      });
      fileContentRequestMapRef.current.set(requestKey, request);
      try {
        return await request;
      } finally {
        fileContentRequestMapRef.current.delete(requestKey);
      }
    },
    [paneId, requestRepoFileContent],
  );

  useEffect(() => {
    contextVersionRef.current += 1;
    treePageRequestMapRef.current.clear();
    searchRequestMapRef.current.clear();
    fileContentRequestMapRef.current.clear();
    activeSearchRequestIdRef.current += 1;
    activeFileContentRequestIdRef.current += 1;
    treePagesRef.current = {};
    if (fileModalCopyTimeoutRef.current != null) {
      window.clearTimeout(fileModalCopyTimeoutRef.current);
      fileModalCopyTimeoutRef.current = null;
    }

    setSelectedFilePath(null);
    setExpandedDirSet(new Set());
    setSearchExpandedDirSet(new Set());
    setSearchCollapsedDirSet(new Set());
    setTreePages({});
    setTreeLoadingByPath({});
    setTreeError(null);
    setSearchQuery("");
    setSearchResult(null);
    setSearchLoading(false);
    setSearchError(null);
    setSearchActiveIndex(0);
    setFileModalOpen(false);
    setFileModalPath(null);
    setFileModalLoading(false);
    setFileModalError(null);
    setFileModalFile(null);
    setFileModalMarkdownViewMode("code");
    setFileModalShowLineNumbers(true);
    setFileModalCopiedPath(false);
    setFileModalCopyError(null);

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
    const requestId = activeSearchRequestIdRef.current + 1;
    activeSearchRequestIdRef.current = requestId;
    if (normalized.length === 0) {
      setSearchResult(null);
      setSearchError(null);
      setSearchLoading(false);
      setSearchActiveIndex(0);
      setSearchExpandedDirSet(new Set());
      setSearchCollapsedDirSet(new Set());
      return;
    }

    setSearchExpandedDirSet(new Set());
    setSearchCollapsedDirSet(new Set());
    const timerId = window.setTimeout(() => {
      setSearchLoading(true);
      setSearchError(null);
      void fetchSearchPage(normalized)
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
          setSearchError(resolveUnknownErrorMessage(error, API_ERROR_MESSAGES.fileSearch));
        })
        .finally(() => {
          if (activeSearchRequestIdRef.current !== requestId) {
            return;
          }
          setSearchLoading(false);
        });
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [fetchSearchPage, repoRoot, searchQuery]);

  const loadTreeRemainingPages = useCallback(
    async (targetPath: string) => {
      if (!repoRoot) {
        return;
      }
      let page: RepoFileTreePage | null | undefined = treePagesRef.current[targetPath];
      if (!page) {
        page = await loadTree(targetPath);
      }
      while (page?.nextCursor) {
        const nextPage = await loadTree(targetPath, page.nextCursor);
        if (!nextPage) {
          return;
        }
        page = nextPage;
      }
    },
    [loadTree, repoRoot],
  );

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

  const revealFilePath = useCallback(
    (targetPath: string) => {
      const ancestors = collectAncestorDirectories(targetPath);
      if (ancestors.length === 0) {
        return;
      }
      setExpandedDirSet((prev) => {
        const next = new Set(prev);
        ancestors.forEach((ancestor) => next.add(ancestor));
        return next;
      });
      ancestors.forEach((ancestor) => {
        const page = treePagesRef.current[ancestor];
        if (!page || page.nextCursor) {
          void loadTreeRemainingPages(ancestor);
        }
      });
    },
    [loadTreeRemainingPages],
  );

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

  const onToggleDirectory = useCallback(
    (targetPath: string) => {
      if (isSearchActive) {
        const isExpanded = effectiveSearchExpandedDirSet.has(targetPath);
        if (isExpanded) {
          setSearchExpandedDirSet((prev) => {
            const next = new Set(prev);
            next.delete(targetPath);
            return next;
          });
          setSearchCollapsedDirSet((prev) => {
            const next = new Set(prev);
            next.add(targetPath);
            return next;
          });
          return;
        }
        setSearchCollapsedDirSet((prev) => {
          const next = new Set(prev);
          next.delete(targetPath);
          return next;
        });
        setSearchExpandedDirSet((prev) => {
          const next = new Set(prev);
          next.add(targetPath);
          return next;
        });
        return;
      }

      const alreadyExpanded = expandedDirSet.has(targetPath);
      setExpandedDirSet((prev) => {
        const next = new Set(prev);
        if (next.has(targetPath)) {
          next.delete(targetPath);
          return next;
        }
        next.add(targetPath);
        return next;
      });
      if (!alreadyExpanded && !treePagesRef.current[targetPath]) {
        void loadTree(targetPath);
      }
    },
    [effectiveSearchExpandedDirSet, expandedDirSet, isSearchActive, loadTree],
  );

  const onSelectFile = useCallback(
    (targetPath: string) => {
      setSelectedFilePath(targetPath);
      revealFilePath(targetPath);
    },
    [revealFilePath],
  );

  const onOpenFileModal = useCallback(
    (targetPath: string) => {
      const contextVersion = contextVersionRef.current;
      const requestId = activeFileContentRequestIdRef.current + 1;
      activeFileContentRequestIdRef.current = requestId;
      setFileModalOpen(true);
      setFileModalPath(targetPath);
      setFileModalLoading(true);
      setFileModalError(null);
      setFileModalShowLineNumbers(true);
      setFileModalCopyError(null);
      setFileModalCopiedPath(false);
      setFileModalFile(null);

      void fetchFileContent(targetPath)
        .then((file) => {
          if (
            contextVersion !== contextVersionRef.current ||
            activeFileContentRequestIdRef.current !== requestId
          ) {
            return;
          }
          setFileModalFile(file);
          setFileModalLoading(false);
          setFileModalError(null);
          setFileModalMarkdownViewMode(isMarkdownFileContent(file) ? "preview" : "code");
        })
        .catch((error) => {
          if (
            contextVersion !== contextVersionRef.current ||
            activeFileContentRequestIdRef.current !== requestId
          ) {
            return;
          }
          setFileModalFile(null);
          setFileModalLoading(false);
          setFileModalError(resolveUnknownErrorMessage(error, API_ERROR_MESSAGES.fileContent));
        });
    },
    [fetchFileContent],
  );

  const onCloseFileModal = useCallback(() => {
    activeFileContentRequestIdRef.current += 1;
    setFileModalOpen(false);
    setFileModalLoading(false);
    setFileModalError(null);
    setFileModalShowLineNumbers(true);
    setFileModalCopyError(null);
    setFileModalCopiedPath(false);
    if (fileModalCopyTimeoutRef.current != null) {
      window.clearTimeout(fileModalCopyTimeoutRef.current);
      fileModalCopyTimeoutRef.current = null;
    }
  }, []);

  const onSetFileModalMarkdownViewMode = useCallback((mode: "code" | "preview") => {
    setFileModalMarkdownViewMode(mode);
  }, []);

  const onToggleFileModalLineNumbers = useCallback(() => {
    setFileModalShowLineNumbers((prev) => !prev);
  }, []);

  const onCopyFileModalPath = useCallback(async () => {
    if (!fileModalPath) {
      return;
    }
    setFileModalCopyError(null);
    const copied = await copyTextToClipboard(fileModalPath);
    if (!copied) {
      setFileModalCopiedPath(false);
      setFileModalCopyError("Failed to copy the file path.");
      return;
    }
    setFileModalCopiedPath(true);
    if (fileModalCopyTimeoutRef.current != null) {
      window.clearTimeout(fileModalCopyTimeoutRef.current);
    }
    fileModalCopyTimeoutRef.current = window.setTimeout(() => {
      setFileModalCopiedPath(false);
      fileModalCopyTimeoutRef.current = null;
    }, 1200);
  }, [fileModalPath]);

  const onSearchMove = useCallback(
    (delta: number) => {
      setSearchActiveIndex((prev) => {
        const items = searchResult?.items ?? [];
        if (items.length === 0) {
          return 0;
        }
        const next = prev + delta;
        if (next < 0) {
          return 0;
        }
        if (next >= items.length) {
          return items.length - 1;
        }
        return next;
      });
    },
    [searchResult?.items],
  );

  const onSearchConfirm = useCallback(() => {
    const item = searchResult?.items[searchActiveIndex];
    if (!item) {
      return;
    }
    if (item.kind === "directory") {
      onToggleDirectory(item.path);
      return;
    }
    onSelectFile(item.path);
    onOpenFileModal(item.path);
  }, [onOpenFileModal, onSelectFile, onToggleDirectory, searchActiveIndex, searchResult?.items]);

  const onLoadMoreTreeRoot = useCallback(() => {
    const target = resolveTreeLoadMoreTarget({
      treePages,
      expandedDirSet,
    });
    if (!target) {
      return;
    }
    void loadTree(target.path, target.cursor);
  }, [expandedDirSet, loadTree, treePages]);

  const onLoadMoreSearch = useCallback(() => {
    if (searchLoading) {
      return;
    }
    if (!searchResult?.nextCursor || !searchResult.query) {
      return;
    }
    const currentRequestId = activeSearchRequestIdRef.current;
    setSearchLoading(true);
    void fetchSearchPage(searchResult.query, searchResult.nextCursor)
      .then((nextPage) => {
        if (activeSearchRequestIdRef.current !== currentRequestId) {
          return;
        }
        setSearchResult((prev) => {
          if (!prev) {
            return nextPage;
          }
          return {
            ...nextPage,
            items: mergeSearchItems(prev.items, nextPage.items),
          };
        });
      })
      .catch((error) => {
        if (activeSearchRequestIdRef.current !== currentRequestId) {
          return;
        }
        setSearchError(resolveUnknownErrorMessage(error, API_ERROR_MESSAGES.fileSearch));
      })
      .finally(() => {
        if (activeSearchRequestIdRef.current !== currentRequestId) {
          return;
        }
        setSearchLoading(false);
      });
  }, [fetchSearchPage, searchLoading, searchResult]);

  useEffect(() => {
    return () => {
      if (fileModalCopyTimeoutRef.current != null) {
        window.clearTimeout(fileModalCopyTimeoutRef.current);
      }
    };
  }, []);

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
    onLoadMoreTreeRoot,
    onLoadMoreSearch,
  };
};

export type SessionFilesViewModel = ReturnType<typeof useSessionFiles>;
