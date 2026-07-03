import type { RepoFileTreePage } from "@vde-monitor/shared";
import { type MutableRefObject, useCallback } from "react";

import { collectAncestorDirectories } from "./session-files-tree-utils";
import { type SessionFilesUiDispatch, setUiState } from "./useSessionFiles-ui-state-machine";

type UseSessionFilesTreeRevealDeps = {
  repoRoot: string | null;
  treePagesRef: MutableRefObject<Record<string, RepoFileTreePage>>;
  loadTree: (targetPath: string, cursor?: string) => Promise<RepoFileTreePage | null>;
};

// Write-only w.r.t. reducer state (expands ancestor directories), so it only
// needs `dispatch`, not the full state.
export const useSessionFilesTreeReveal = (
  dispatch: SessionFilesUiDispatch,
  { repoRoot, treePagesRef, loadTree }: UseSessionFilesTreeRevealDeps,
) => {
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
    [loadTree, repoRoot, treePagesRef],
  );

  const revealFilePath = useCallback(
    (targetPath: string) => {
      const ancestors = collectAncestorDirectories(targetPath);
      if (ancestors.length === 0) {
        return;
      }
      setUiState(dispatch, "expandedDirSet", (prev) => {
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
    [dispatch, loadTreeRemainingPages, treePagesRef],
  );

  return {
    revealFilePath,
  };
};
