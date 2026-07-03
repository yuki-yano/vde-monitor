import { useMemo } from "react";

import { buildSearchExpandPlan } from "../file-tree-search-expand";
import type { SessionFilesUiState } from "./useSessionFiles-ui-state-machine";

type UseSessionFilesSearchExpandStateState = Pick<
  SessionFilesUiState,
  | "searchResult"
  | "searchActiveIndex"
  | "searchExpandedDirSet"
  | "searchCollapsedDirSet"
  | "searchQuery"
>;

type UseSessionFilesSearchExpandStateDeps = {
  autoExpandMatchLimit: number;
};

// Pure derivation from state, no dispatch needed.
export const useSessionFilesSearchExpandState = (
  {
    searchResult,
    searchActiveIndex,
    searchExpandedDirSet,
    searchCollapsedDirSet,
    searchQuery,
  }: UseSessionFilesSearchExpandStateState,
  { autoExpandMatchLimit }: UseSessionFilesSearchExpandStateDeps,
) => {
  const searchExpandPlan = useMemo(
    () =>
      buildSearchExpandPlan({
        matchedPaths: searchResult?.items.map((item) => item.path) ?? [],
        activeIndex: searchActiveIndex,
        autoExpandMatchLimit,
        truncated: searchResult?.truncated ?? false,
        totalMatchedCount: searchResult?.totalMatchedCount ?? 0,
      }),
    [autoExpandMatchLimit, searchActiveIndex, searchResult],
  );

  const effectiveSearchExpandedDirSet = useMemo(() => {
    const merged = new Set(searchExpandPlan.expandedDirSet);
    searchExpandedDirSet.forEach((path) => merged.add(path));
    searchCollapsedDirSet.forEach((path) => merged.delete(path));
    return merged;
  }, [searchCollapsedDirSet, searchExpandPlan.expandedDirSet, searchExpandedDirSet]);

  return {
    searchExpandPlan,
    effectiveSearchExpandedDirSet,
    isSearchActive: searchQuery.trim().length > 0,
  };
};
