import type { RepoFileTreePage } from "@vde-monitor/shared";
import { describe, expect, it } from "vitest";

import {
  type SessionFilesUiState,
  createInitialSessionFilesUiState,
  reduceSessionFilesUiState,
  setUiState,
} from "./useSessionFiles-ui-state-machine";

const dispatchTo = (
  state: SessionFilesUiState,
  action: Parameters<typeof reduceSessionFilesUiState>[1],
) => reduceSessionFilesUiState(state, action);

describe("reduceSessionFilesUiState", () => {
  describe("contextReset", () => {
    it("resets every field back to the initial state, including former per-hook useState fields", () => {
      const mutated: SessionFilesUiState = {
        ...createInitialSessionFilesUiState(),
        selectedFilePath: "src/index.ts",
        searchQuery: "index",
        searchResult: { query: "index", items: [], truncated: false, totalMatchedCount: 0 },
        searchActiveIndex: 2,
        fileModalOpen: true,
        fileModalPath: "src/index.ts",
        expandedDirSet: new Set(["src"]),
        searchExpandedDirSet: new Set(["src/app"]),
        searchCollapsedDirSet: new Set(["src/lib"]),
        treePages: { ".": { basePath: ".", entries: [] } },
        treeLoadingByPath: { ".": true },
        treeError: "boom",
        logFileCandidateModalOpen: true,
        logFileCandidateItems: [{ path: "a.ts", name: "a.ts" }],
      };

      const next = reduceSessionFilesUiState(mutated, { type: "contextReset" });

      expect(next).toEqual(createInitialSessionFilesUiState());
      // contextReset must produce fresh Set/object instances, not share
      // identity with the pre-reset state (would leak stale entries).
      expect(next.expandedDirSet).not.toBe(mutated.expandedDirSet);
      expect(next.treePages).not.toBe(mutated.treePages);
    });

    it("is a one-dispatch reset regardless of how much state has drifted", () => {
      let state = createInitialSessionFilesUiState();
      state = dispatchTo(state, { type: "set", key: "searchQuery", value: "a" });
      state = dispatchTo(state, { type: "set", key: "selectedFilePath", value: "a.ts" });
      state = dispatchTo(state, {
        type: "openLogFileCandidate",
        reference: "a.ts",
        paneId: "%1",
        line: 3,
        items: [{ path: "a.ts", name: "a.ts" }],
      });

      const reset = reduceSessionFilesUiState(state, { type: "contextReset" });
      expect(reset).toEqual(createInitialSessionFilesUiState());
    });
  });

  describe("generic set action", () => {
    it("applies a plain value", () => {
      const state = createInitialSessionFilesUiState();
      const next = reduceSessionFilesUiState(state, {
        type: "set",
        key: "searchQuery",
        value: "index",
      });
      expect(next.searchQuery).toBe("index");
    });

    it("applies a functional updater, mirroring setState(prev => ...)", () => {
      const state = { ...createInitialSessionFilesUiState(), searchActiveIndex: 2 };
      const next = reduceSessionFilesUiState(state, {
        type: "set",
        key: "searchActiveIndex",
        value: (prev: number) => prev + 1,
      });
      expect(next.searchActiveIndex).toBe(3);
    });

    it("returns the same state reference when the value is unchanged (bails out of a re-render)", () => {
      const state = createInitialSessionFilesUiState();
      const next = reduceSessionFilesUiState(state, {
        type: "set",
        key: "searchLoading",
        value: false,
      });
      expect(next).toBe(state);
    });
  });

  describe("search state transitions", () => {
    it("clears search-expand overrides and search results together when the query is cleared", () => {
      let state: SessionFilesUiState = {
        ...createInitialSessionFilesUiState(),
        searchQuery: "index",
        searchResult: { query: "index", items: [], truncated: false, totalMatchedCount: 1 },
        searchExpandedDirSet: new Set(["src/app"]),
        searchCollapsedDirSet: new Set(["src/lib"]),
        searchActiveIndex: 1,
      };
      state = dispatchTo(state, { type: "set", key: "searchExpandedDirSet", value: new Set() });
      state = dispatchTo(state, { type: "set", key: "searchCollapsedDirSet", value: new Set() });
      state = dispatchTo(state, { type: "set", key: "searchResult", value: null });
      state = dispatchTo(state, { type: "set", key: "searchError", value: null });
      state = dispatchTo(state, { type: "set", key: "searchLoading", value: false });
      state = dispatchTo(state, { type: "set", key: "searchActiveIndex", value: 0 });

      expect(state.searchResult).toBeNull();
      expect(state.searchExpandedDirSet.size).toBe(0);
      expect(state.searchCollapsedDirSet.size).toBe(0);
      expect(state.searchActiveIndex).toBe(0);
    });

    it("clamps searchActiveIndex into range as search results shrink", () => {
      const state: SessionFilesUiState = {
        ...createInitialSessionFilesUiState(),
        searchActiveIndex: 5,
      };
      const next = dispatchTo(state, {
        type: "set",
        key: "searchActiveIndex",
        value: (prev: number) => Math.min(prev, 1),
      });
      expect(next.searchActiveIndex).toBe(1);
    });
  });

  describe("tree expand state", () => {
    it("toggles a directory into expandedDirSet without disturbing other entries", () => {
      const state: SessionFilesUiState = {
        ...createInitialSessionFilesUiState(),
        expandedDirSet: new Set(["src"]),
      };
      const expanded = dispatchTo(state, {
        type: "set",
        key: "expandedDirSet",
        value: (prev: Set<string>) => new Set(prev).add("src/app"),
      });
      expect(Array.from(expanded.expandedDirSet).sort()).toEqual(["src", "src/app"]);

      const collapsed = dispatchTo(expanded, {
        type: "set",
        key: "expandedDirSet",
        value: (prev: Set<string>) => {
          const next = new Set(prev);
          next.delete("src");
          return next;
        },
      });
      expect(Array.from(collapsed.expandedDirSet)).toEqual(["src/app"]);
    });

    it("merges incoming tree pages without dropping previously loaded siblings", () => {
      const firstPage: RepoFileTreePage = {
        basePath: ".",
        entries: [{ path: "README.md", name: "README.md", kind: "file" }],
      };
      const state = dispatchTo(createInitialSessionFilesUiState(), {
        type: "set",
        key: "treePages",
        value: { ".": firstPage },
      });

      const srcPage: RepoFileTreePage = {
        basePath: "src",
        entries: [{ path: "src/index.ts", name: "index.ts", kind: "file" }],
      };
      const next = dispatchTo(state, {
        type: "set",
        key: "treePages",
        value: (prev: Record<string, RepoFileTreePage>) => ({ ...prev, src: srcPage }),
      });

      expect(next.treePages["."]).toBe(firstPage);
      expect(next.treePages.src).toBe(srcPage);
    });
  });

  describe("file modal actions", () => {
    it("openFileModal enters the loading state and clears any previous file/copy state", () => {
      const state: SessionFilesUiState = {
        ...createInitialSessionFilesUiState(),
        fileModalCopiedPath: true,
        fileModalCopyError: "previous error",
        fileModalShowLineNumbers: false,
      };
      const next = reduceSessionFilesUiState(state, {
        type: "openFileModal",
        path: "src/index.ts",
        highlightLine: 12,
      });

      expect(next).toMatchObject({
        fileModalOpen: true,
        fileModalPath: "src/index.ts",
        fileModalLoading: true,
        fileModalError: null,
        fileModalShowLineNumbers: true,
        fileModalCopyError: null,
        fileModalCopiedPath: false,
        fileModalFile: null,
        fileModalHighlightLine: 12,
      });
    });

    it("fileModalLoaded stores the file and view mode without touching fileModalPath", () => {
      const state: SessionFilesUiState = {
        ...createInitialSessionFilesUiState(),
        fileModalOpen: true,
        fileModalPath: "README.md",
        fileModalLoading: true,
      };
      const file = {
        path: "README.md",
        sizeBytes: 8,
        isBinary: false,
        truncated: false,
        languageHint: "markdown" as const,
        content: "# hi",
      };
      const next = reduceSessionFilesUiState(state, {
        type: "fileModalLoaded",
        file,
        markdownViewMode: "preview",
      });
      expect(next.fileModalFile).toBe(file);
      expect(next.fileModalLoading).toBe(false);
      expect(next.fileModalMarkdownViewMode).toBe("preview");
      expect(next.fileModalPath).toBe("README.md");
    });

    it("closeFileModal resets modal chrome but preserves the last-loaded file/path", () => {
      const file = {
        path: "README.md",
        sizeBytes: 8,
        isBinary: false,
        truncated: false,
        languageHint: "markdown" as const,
        content: "# hi",
      };
      const state: SessionFilesUiState = {
        ...createInitialSessionFilesUiState(),
        fileModalOpen: true,
        fileModalPath: "README.md",
        fileModalFile: file,
        fileModalShowLineNumbers: false,
        fileModalCopiedPath: true,
        fileModalHighlightLine: 3,
      };
      const next = reduceSessionFilesUiState(state, { type: "closeFileModal" });
      expect(next.fileModalOpen).toBe(false);
      expect(next.fileModalShowLineNumbers).toBe(true);
      expect(next.fileModalCopiedPath).toBe(false);
      expect(next.fileModalHighlightLine).toBeNull();
      // Matches the pre-refactor onCloseFileModal behavior: path/file/markdown
      // mode are intentionally left untouched on close.
      expect(next.fileModalPath).toBe("README.md");
      expect(next.fileModalFile).toBe(file);
    });
  });

  describe("log resolve state", () => {
    it("startLogResolve clears the previous error and any open candidate picker in one dispatch", () => {
      const state: SessionFilesUiState = {
        ...createInitialSessionFilesUiState(),
        fileResolveError: "old error",
        logFileCandidateModalOpen: true,
        logFileCandidateReference: "old.ts",
        logFileCandidatePaneId: "%1",
        logFileCandidateLine: 1,
        logFileCandidateItems: [{ path: "old.ts", name: "old.ts" }],
      };
      const next = reduceSessionFilesUiState(state, { type: "startLogResolve" });
      expect(next.fileResolveError).toBeNull();
      expect(next.logFileCandidateModalOpen).toBe(false);
      expect(next.logFileCandidateReference).toBeNull();
      expect(next.logFileCandidatePaneId).toBeNull();
      expect(next.logFileCandidateLine).toBeNull();
      expect(next.logFileCandidateItems).toEqual([]);
    });

    it("openLogFileCandidate opens the picker with the given candidates", () => {
      const items = [
        { path: "apps/server/src/index.ts", name: "index.ts" },
        { path: "apps/web/src/index.ts", name: "index.ts" },
      ];
      const next = reduceSessionFilesUiState(createInitialSessionFilesUiState(), {
        type: "openLogFileCandidate",
        reference: "index.ts",
        paneId: "pane-log",
        line: 4,
        items,
      });
      expect(next.logFileCandidateModalOpen).toBe(true);
      expect(next.logFileCandidatePaneId).toBe("pane-log");
      expect(next.logFileCandidateLine).toBe(4);
      expect(next.logFileCandidateItems).toBe(items);
    });

    it("closeLogFileCandidate resets the picker fields only", () => {
      const state: SessionFilesUiState = {
        ...createInitialSessionFilesUiState(),
        fileResolveError: "kept as-is",
        logFileCandidateModalOpen: true,
        logFileCandidatePaneId: "%1",
      };
      const next = reduceSessionFilesUiState(state, { type: "closeLogFileCandidate" });
      expect(next.logFileCandidateModalOpen).toBe(false);
      expect(next.logFileCandidatePaneId).toBeNull();
      expect(next.fileResolveError).toBe("kept as-is");
    });
  });
});

describe("setUiState", () => {
  it("dispatches a typed set action", () => {
    const calls: unknown[] = [];
    const dispatch = (action: unknown) => calls.push(action);
    setUiState(dispatch, "searchQuery", "abc");
    expect(calls).toEqual([{ type: "set", key: "searchQuery", value: "abc" }]);
  });
});
