import { useEffect } from "react";

import { type ResetSessionFilesRefsInput, resetSessionFilesRefs } from "./session-files-reset";
import type { SessionFilesUiDispatch } from "./useSessionFiles-ui-state-machine";

type UseSessionFilesContextResetEffectDeps = {
  paneId: string;
  repoRoot: string | null;
  worktreePath: string | null;
  loadTree: (targetPath: string) => Promise<unknown>;
} & ResetSessionFilesRefsInput;

// Pane/worktree switch reset: was ~30 individual setter calls, now a single
// `contextReset` dispatch (reducer state) + the ref bookkeeping that can't
// live in reducer state (in-flight request maps, request-id counters).
export const useSessionFilesContextResetEffect = (
  dispatch: SessionFilesUiDispatch,
  {
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
    cancelFileModalCopyTimeout,
  }: UseSessionFilesContextResetEffectDeps,
) => {
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
      cancelFileModalCopyTimeout,
    });
    dispatch({ type: "contextReset" });

    if (!repoRoot) {
      return;
    }
    void loadTree(".");
  }, [
    activeFileContentRequestIdRef,
    activeLogResolveRequestIdRef,
    activeSearchRequestIdRef,
    cancelFileModalCopyTimeout,
    contextVersionRef,
    dispatch,
    fileContentRequestMapRef,
    loadTree,
    logReferenceLinkableCacheRef,
    logReferenceLinkableRequestMapRef,
    paneId,
    repoRoot,
    worktreePath,
    searchRequestMapRef,
    treePageRequestMapRef,
    treePagesRef,
  ]);
};
