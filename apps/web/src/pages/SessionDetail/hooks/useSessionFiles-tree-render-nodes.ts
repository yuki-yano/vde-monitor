import { useMemo } from "react";

import {
  buildNormalRenderNodes,
  buildSearchRenderNodes,
  resolveTreeLoadMoreTarget,
} from "./session-files-tree-utils";
import type { SessionFilesUiState } from "./useSessionFiles-ui-state-machine";

type UseSessionFilesTreeRenderNodesState = Pick<
  SessionFilesUiState,
  "searchResult" | "searchActiveIndex" | "selectedFilePath" | "treePages" | "expandedDirSet"
>;

type UseSessionFilesTreeRenderNodesDeps = {
  isSearchActive: boolean;
  effectiveSearchExpandedDirSet: Set<string>;
};

// Pure derivation from state, no dispatch needed.
export const useSessionFilesTreeRenderNodes = (
  {
    searchResult,
    searchActiveIndex,
    selectedFilePath,
    treePages,
    expandedDirSet,
  }: UseSessionFilesTreeRenderNodesState,
  { isSearchActive, effectiveSearchExpandedDirSet }: UseSessionFilesTreeRenderNodesDeps,
) => {
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

  const rootTreeHasMore =
    resolveTreeLoadMoreTarget({
      treePages,
      expandedDirSet,
    }) != null;

  return {
    treeNodes: isSearchActive ? searchTreeNodes : normalTreeNodes,
    rootTreeHasMore,
  };
};
