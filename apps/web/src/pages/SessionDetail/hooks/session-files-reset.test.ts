import type { RepoFileContent, RepoFileSearchPage, RepoFileTreePage } from "@vde-monitor/shared";
import { describe, expect, it, vi } from "vitest";

import { resetSessionFilesRefs } from "./session-files-reset";

describe("useSessionFiles reset helpers", () => {
  it("resets request refs, increments request ids, and cancels the file-modal copy timeout", () => {
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
    const cancelFileModalCopyTimeout = vi.fn();
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
      cancelFileModalCopyTimeout,
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
    expect(cancelFileModalCopyTimeout).toHaveBeenCalledTimes(1);
  });
});
