import type { RepoFileSearchPage } from "@vde-monitor/shared";
import { type MutableRefObject, useEffect } from "react";

import { useTimeout } from "@/lib/use-timeout";

import {
  applyEmptySearchState,
  createNextSearchRequestId,
  resetSearchExpandOverrides,
  runSearchRequest,
} from "./session-files-search-effect";
import {
  type SessionFilesUiDispatch,
  type SessionFilesUiState,
  setUiState,
} from "./useSessionFiles-ui-state-machine";

type UseSessionFilesSearchEffectsState = Pick<SessionFilesUiState, "searchQuery" | "searchResult">;

type UseSessionFilesSearchEffectsDeps = {
  repoRoot: string | null;
  searchDebounceMs: number;
  activeSearchRequestIdRef: MutableRefObject<number>;
  fetchSearchPage: (query: string, cursor?: string) => Promise<RepoFileSearchPage>;
  resolveSearchErrorMessage: (error: unknown) => string;
};

export const useSessionFilesSearchEffects = (
  state: UseSessionFilesSearchEffectsState,
  dispatch: SessionFilesUiDispatch,
  {
    repoRoot,
    searchDebounceMs,
    activeSearchRequestIdRef,
    fetchSearchPage,
    resolveSearchErrorMessage,
  }: UseSessionFilesSearchEffectsDeps,
) => {
  const debounce = useTimeout();
  const { searchQuery, searchResult } = state;

  useEffect(() => {
    if (!repoRoot) {
      return;
    }
    const normalized = searchQuery.trim();
    const requestId = createNextSearchRequestId(activeSearchRequestIdRef);
    resetSearchExpandOverrides(dispatch);
    if (normalized.length === 0) {
      applyEmptySearchState(dispatch);
      return () => debounce.cancel();
    }

    debounce.set(() => {
      void runSearchRequest({
        requestId,
        activeSearchRequestIdRef,
        normalizedQuery: normalized,
        fetchSearchPage,
        resolveErrorMessage: resolveSearchErrorMessage,
        dispatch,
      });
    }, searchDebounceMs);

    return () => debounce.cancel();
  }, [
    activeSearchRequestIdRef,
    debounce,
    dispatch,
    fetchSearchPage,
    repoRoot,
    resolveSearchErrorMessage,
    searchDebounceMs,
    searchQuery,
  ]);

  useEffect(() => {
    if (!searchResult) {
      return;
    }
    if (searchResult.items.length === 0) {
      setUiState(dispatch, "searchActiveIndex", 0);
      return;
    }
    setUiState(dispatch, "searchActiveIndex", (prev) => {
      if (prev < 0) {
        return 0;
      }
      if (prev >= searchResult.items.length) {
        return searchResult.items.length - 1;
      }
      return prev;
    });
  }, [dispatch, searchResult]);
};
