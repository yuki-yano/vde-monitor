import type { RepoFileContent, RepoFileSearchPage, RepoFileTreePage } from "@vde-monitor/shared";
import { describe, expect, it, vi } from "vitest";

import { resetSessionFilesRefs, resetSessionFilesState } from "./useSessionFiles-reset";

describe("useSessionFiles reset helpers", () => {
  it("resets request refs and increments request ids", () => {
    const clearTimeoutSpy = vi.spyOn(window, "clearTimeout");
    const treePageRequestMapRef: { current: Map<string, Promise<RepoFileTreePage>> } = {
      current: new Map<string, Promise<RepoFileTreePage>>(),
    };
    const searchRequestMapRef: { current: Map<string, Promise<RepoFileSearchPage>> } = {
      current: new Map<string, Promise<RepoFileSearchPage>>(),
    };
    const fileContentRequestMapRef: { current: Map<string, Promise<RepoFileContent>> } = {
      current: new Map<string, Promise<RepoFileContent>>(),
    };
    const logReferenceLinkableCacheRef = { current: new Map<string, boolean>() };
    const logReferenceLinkableRequestMapRef = { current: new Map<string, Promise<boolean>>() };
    const activeSearchRequestIdRef = { current: 1 };
    const activeFileContentRequestIdRef = { current: 2 };
    const activeLogResolveRequestIdRef = { current: 3 };
    const contextVersionRef = { current: 4 };
    const treePagesRef: { current: Record<string, RepoFileTreePage> } = {
      current: { src: { basePath: "src", entries: [] } },
    };
    const fileModalCopyTimeoutRef = { current: 123 as number | null };
    treePageRequestMapRef.current.set("k", Promise.resolve({ basePath: ".", entries: [] }));
    searchRequestMapRef.current.set(
      "k",
      Promise.resolve({
        query: "q",
        items: [],
        truncated: false,
        totalMatchedCount: 0,
      }),
    );
    fileContentRequestMapRef.current.set(
      "k",
      Promise.resolve({
        path: "src/index.ts",
        sizeBytes: 1,
        isBinary: false,
        truncated: false,
        languageHint: "text",
        content: "x",
      }),
    );
    logReferenceLinkableCacheRef.current.set("k", true);
    logReferenceLinkableRequestMapRef.current.set("k", Promise.resolve(true));

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

    expect(treePageRequestMapRef.current.size).toBe(0);
    expect(searchRequestMapRef.current.size).toBe(0);
    expect(fileContentRequestMapRef.current.size).toBe(0);
    expect(logReferenceLinkableCacheRef.current.size).toBe(0);
    expect(logReferenceLinkableRequestMapRef.current.size).toBe(0);
    expect(activeSearchRequestIdRef.current).toBe(2);
    expect(activeFileContentRequestIdRef.current).toBe(3);
    expect(activeLogResolveRequestIdRef.current).toBe(4);
    expect(contextVersionRef.current).toBe(5);
    expect(treePagesRef.current).toEqual({});
    expect(fileModalCopyTimeoutRef.current).toBeNull();
    expect(clearTimeoutSpy).toHaveBeenCalledWith(123);

    clearTimeoutSpy.mockRestore();
  });

  it("resets useSessionFiles states to defaults", () => {
    const setSelectedFilePath = vi.fn();
    const setExpandedDirSet = vi.fn();
    const setSearchExpandedDirSet = vi.fn();
    const setSearchCollapsedDirSet = vi.fn();
    const setTreePages = vi.fn();
    const setTreeLoadingByPath = vi.fn();
    const setTreeError = vi.fn();
    const setSearchQuery = vi.fn();
    const setSearchResult = vi.fn();
    const setSearchLoading = vi.fn();
    const setSearchError = vi.fn();
    const setSearchActiveIndex = vi.fn();
    const setFileModalOpen = vi.fn();
    const setFileModalPath = vi.fn();
    const setFileModalLoading = vi.fn();
    const setFileModalError = vi.fn();
    const setFileModalFile = vi.fn();
    const setFileModalMarkdownViewMode = vi.fn();
    const setFileModalShowLineNumbers = vi.fn();
    const setFileModalCopiedPath = vi.fn();
    const setFileModalCopyError = vi.fn();
    const setFileModalHighlightLine = vi.fn();
    const setFileResolveError = vi.fn();
    const setLogFileCandidateModalOpen = vi.fn();
    const setLogFileCandidateReference = vi.fn();
    const setLogFileCandidatePaneId = vi.fn();
    const setLogFileCandidateLine = vi.fn();
    const setLogFileCandidateItems = vi.fn();

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

    expect(setSelectedFilePath).toHaveBeenCalledWith(null);
    expect(setTreePages).toHaveBeenCalledWith({});
    expect(setTreeError).toHaveBeenCalledWith(null);
    expect(setSearchQuery).toHaveBeenCalledWith("");
    expect(setSearchLoading).toHaveBeenCalledWith(false);
    expect(setFileModalOpen).toHaveBeenCalledWith(false);
    expect(setFileModalMarkdownViewMode).toHaveBeenCalledWith("code");
    expect(setFileModalShowLineNumbers).toHaveBeenCalledWith(true);
    expect(setFileResolveError).toHaveBeenCalledWith(null);
    expect(setLogFileCandidateItems).toHaveBeenCalledWith([]);
    expect((setExpandedDirSet.mock.calls[0] ?? [])[0]).toBeInstanceOf(Set);
    expect((setSearchExpandedDirSet.mock.calls[0] ?? [])[0]).toBeInstanceOf(Set);
    expect((setSearchCollapsedDirSet.mock.calls[0] ?? [])[0]).toBeInstanceOf(Set);
  });
});
