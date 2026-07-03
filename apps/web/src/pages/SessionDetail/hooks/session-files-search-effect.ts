import type { RepoFileSearchPage } from "@vde-monitor/shared";
import type { MutableRefObject } from "react";

import { type SessionFilesUiDispatch, setUiState } from "./useSessionFiles-ui-state-machine";

type RunSearchRequestInput = {
  requestId: number;
  activeSearchRequestIdRef: MutableRefObject<number>;
  normalizedQuery: string;
  fetchSearchPage: (query: string) => Promise<RepoFileSearchPage>;
  resolveErrorMessage: (error: unknown) => string;
  dispatch: SessionFilesUiDispatch;
};

export const createNextSearchRequestId = (activeSearchRequestIdRef: MutableRefObject<number>) => {
  const requestId = activeSearchRequestIdRef.current + 1;
  activeSearchRequestIdRef.current = requestId;
  return requestId;
};

export const resetSearchExpandOverrides = (dispatch: SessionFilesUiDispatch) => {
  setUiState(dispatch, "searchExpandedDirSet", new Set());
  setUiState(dispatch, "searchCollapsedDirSet", new Set());
};

export const applyEmptySearchState = (dispatch: SessionFilesUiDispatch) => {
  setUiState(dispatch, "searchResult", null);
  setUiState(dispatch, "searchError", null);
  setUiState(dispatch, "searchLoading", false);
  setUiState(dispatch, "searchActiveIndex", 0);
};

// Runs the actual search request once the debounce timer (owned by the
// calling hook via `useTimeout`/`useDebouncedCallback`) fires. Guards every
// state update against the request having gone stale in the meantime.
export const runSearchRequest = async ({
  requestId,
  activeSearchRequestIdRef,
  normalizedQuery,
  fetchSearchPage,
  resolveErrorMessage,
  dispatch,
}: RunSearchRequestInput) => {
  setUiState(dispatch, "searchLoading", true);
  setUiState(dispatch, "searchError", null);
  try {
    const nextPage = await fetchSearchPage(normalizedQuery);
    if (activeSearchRequestIdRef.current !== requestId) {
      return;
    }
    setUiState(dispatch, "searchResult", nextPage);
    setUiState(dispatch, "searchActiveIndex", 0);
  } catch (error) {
    if (activeSearchRequestIdRef.current !== requestId) {
      return;
    }
    setUiState(dispatch, "searchError", resolveErrorMessage(error));
  } finally {
    if (activeSearchRequestIdRef.current === requestId) {
      setUiState(dispatch, "searchLoading", false);
    }
  }
};
