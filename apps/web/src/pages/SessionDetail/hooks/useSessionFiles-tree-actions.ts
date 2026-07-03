import type { RepoFileTreePage } from "@vde-monitor/shared";
import { type MutableRefObject, useCallback } from "react";

import { resolveTreeLoadMoreTarget } from "./session-files-tree-utils";
import {
  type SessionFilesUiDispatch,
  type SessionFilesUiState,
  setUiState,
} from "./useSessionFiles-ui-state-machine";

type UseSessionFilesTreeActionsState = Pick<SessionFilesUiState, "expandedDirSet" | "treePages">;

type UseSessionFilesTreeActionsDeps = {
  isSearchActive: boolean;
  effectiveSearchExpandedDirSet: Set<string>;
  treePagesRef: MutableRefObject<Record<string, RepoFileTreePage>>;
  loadTree: (targetPath: string, cursor?: string) => Promise<RepoFileTreePage | null>;
};

export const useSessionFilesTreeActions = (
  { expandedDirSet, treePages }: UseSessionFilesTreeActionsState,
  dispatch: SessionFilesUiDispatch,
  {
    isSearchActive,
    effectiveSearchExpandedDirSet,
    treePagesRef,
    loadTree,
  }: UseSessionFilesTreeActionsDeps,
) => {
  const onToggleDirectory = useCallback(
    (targetPath: string) => {
      if (isSearchActive) {
        const isExpanded = effectiveSearchExpandedDirSet.has(targetPath);
        if (isExpanded) {
          setUiState(dispatch, "searchExpandedDirSet", (prev) => {
            const next = new Set(prev);
            next.delete(targetPath);
            return next;
          });
          setUiState(dispatch, "searchCollapsedDirSet", (prev) => {
            const next = new Set(prev);
            next.add(targetPath);
            return next;
          });
          return;
        }
        setUiState(dispatch, "searchCollapsedDirSet", (prev) => {
          const next = new Set(prev);
          next.delete(targetPath);
          return next;
        });
        setUiState(dispatch, "searchExpandedDirSet", (prev) => {
          const next = new Set(prev);
          next.add(targetPath);
          return next;
        });
        return;
      }

      const alreadyExpanded = expandedDirSet.has(targetPath);
      setUiState(dispatch, "expandedDirSet", (prev) => {
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
    [
      dispatch,
      effectiveSearchExpandedDirSet,
      expandedDirSet,
      isSearchActive,
      loadTree,
      treePagesRef,
    ],
  );

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

  return {
    onToggleDirectory,
    onLoadMoreTreeRoot,
  };
};
