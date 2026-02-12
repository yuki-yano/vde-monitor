import type { RepoFileSearchPage, RepoFileTreePage } from "@vde-monitor/shared";
import { useMemo } from "react";

import {
  buildNormalRenderNodes,
  buildSearchRenderNodes,
  resolveTreeLoadMoreTarget,
} from "./useSessionFiles-tree-utils";

type UseSessionFilesTreeRenderNodesArgs = {
  isSearchActive: boolean;
  searchResult: RepoFileSearchPage | null;
  searchActiveIndex: number;
  selectedFilePath: string | null;
  effectiveSearchExpandedDirSet: Set<string>;
  treePages: Record<string, RepoFileTreePage>;
  expandedDirSet: Set<string>;
};

export const useSessionFilesTreeRenderNodes = ({
  isSearchActive,
  searchResult,
  searchActiveIndex,
  selectedFilePath,
  effectiveSearchExpandedDirSet,
  treePages,
  expandedDirSet,
}: UseSessionFilesTreeRenderNodesArgs) => {
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
