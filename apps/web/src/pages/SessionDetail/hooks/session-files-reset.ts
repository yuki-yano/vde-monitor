import type { RepoFileContent, RepoFileSearchPage, RepoFileTreePage } from "@vde-monitor/shared";
import type { MutableRefObject } from "react";

// UI/domain state reset (selectedFilePath, search, tree pages, file modal,
// log-resolve candidates, ...) is handled by the reducer's single
// `contextReset` action (see useSessionFiles-ui-state-machine.ts). Only
// request bookkeeping that lives in refs (not reducer state, since it must
// never trigger a re-render) is reset here.
export type ResetSessionFilesRefsInput = {
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
  cancelFileModalCopyTimeout: () => void;
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
  cancelFileModalCopyTimeout,
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
  cancelFileModalCopyTimeout();
};
