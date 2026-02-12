import type { RepoFileContent, RepoFileSearchPage, RepoFileTreePage } from "@vde-monitor/shared";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";

type ResetSessionFilesRefsInput = {
  treePageRequestMapRef: MutableRefObject<Map<string, Promise<RepoFileTreePage>>>;
  searchRequestMapRef: MutableRefObject<Map<string, Promise<RepoFileSearchPage>>>;
  fileContentRequestMapRef: MutableRefObject<Map<string, Promise<RepoFileContent>>>;
  logReferenceLinkableCacheRef: MutableRefObject<Map<string, boolean>>;
  logReferenceLinkableRequestMapRef: MutableRefObject<Map<string, Promise<boolean>>>;
  activeSearchRequestIdRef: MutableRefObject<number>;
  activeFileContentRequestIdRef: MutableRefObject<number>;
  activeLogResolveRequestIdRef: MutableRefObject<number>;
  contextVersionRef: MutableRefObject<number>;
  treePagesRef: MutableRefObject<Record<string, RepoFileTreePage>>;
  fileModalCopyTimeoutRef: MutableRefObject<number | null>;
};

type SetState<T> = Dispatch<SetStateAction<T>>;

type ResetSessionFilesStateInput = {
  setSelectedFilePath: SetState<string | null>;
  setExpandedDirSet: SetState<Set<string>>;
  setSearchExpandedDirSet: SetState<Set<string>>;
  setSearchCollapsedDirSet: SetState<Set<string>>;
  setTreePages: SetState<Record<string, RepoFileTreePage>>;
  setTreeLoadingByPath: SetState<Record<string, boolean>>;
  setTreeError: SetState<string | null>;
  setSearchQuery: SetState<string>;
  setSearchResult: SetState<RepoFileSearchPage | null>;
  setSearchLoading: SetState<boolean>;
  setSearchError: SetState<string | null>;
  setSearchActiveIndex: SetState<number>;
  setFileModalOpen: SetState<boolean>;
  setFileModalPath: SetState<string | null>;
  setFileModalLoading: SetState<boolean>;
  setFileModalError: SetState<string | null>;
  setFileModalFile: SetState<RepoFileContent | null>;
  setFileModalMarkdownViewMode: SetState<"code" | "preview">;
  setFileModalShowLineNumbers: SetState<boolean>;
  setFileModalCopiedPath: SetState<boolean>;
  setFileModalCopyError: SetState<string | null>;
  setFileModalHighlightLine: SetState<number | null>;
  setFileResolveError: SetState<string | null>;
  setLogFileCandidateModalOpen: SetState<boolean>;
  setLogFileCandidateReference: SetState<string | null>;
  setLogFileCandidatePaneId: SetState<string | null>;
  setLogFileCandidateLine: SetState<number | null>;
  setLogFileCandidateItems: SetState<Array<{ path: string; name: string; isIgnored?: boolean }>>;
};

export const resetSessionFilesRefs = ({
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
}: ResetSessionFilesRefsInput) => {
  contextVersionRef.current += 1;
  treePageRequestMapRef.current.clear();
  searchRequestMapRef.current.clear();
  fileContentRequestMapRef.current.clear();
  logReferenceLinkableCacheRef.current.clear();
  logReferenceLinkableRequestMapRef.current.clear();
  activeSearchRequestIdRef.current += 1;
  activeFileContentRequestIdRef.current += 1;
  activeLogResolveRequestIdRef.current += 1;
  treePagesRef.current = {};
  if (fileModalCopyTimeoutRef.current != null) {
    window.clearTimeout(fileModalCopyTimeoutRef.current);
    fileModalCopyTimeoutRef.current = null;
  }
};

export const resetSessionFilesState = ({
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
}: ResetSessionFilesStateInput) => {
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
  setFileModalHighlightLine(null);
  setFileResolveError(null);
  setLogFileCandidateModalOpen(false);
  setLogFileCandidateReference(null);
  setLogFileCandidatePaneId(null);
  setLogFileCandidateLine(null);
  setLogFileCandidateItems([]);
};
