import type { RepoFileSearchPage } from "@vde-monitor/shared";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";

type SetState<T> = Dispatch<SetStateAction<T>>;

type SearchExpandOverrideSetters = {
  setSearchExpandedDirSet: SetState<Set<string>>;
  setSearchCollapsedDirSet: SetState<Set<string>>;
};

type EmptySearchStateSetters = {
  setSearchResult: SetState<RepoFileSearchPage | null>;
  setSearchError: SetState<string | null>;
  setSearchLoading: SetState<boolean>;
  setSearchActiveIndex: SetState<number>;
};

type ScheduleSearchRequestInput = {
  requestId: number;
  activeSearchRequestIdRef: MutableRefObject<number>;
  normalizedQuery: string;
  debounceMs: number;
  fetchSearchPage: (query: string) => Promise<RepoFileSearchPage>;
  resolveErrorMessage: (error: unknown) => string;
  setSearchLoading: SetState<boolean>;
  setSearchError: SetState<string | null>;
  setSearchResult: SetState<RepoFileSearchPage | null>;
  setSearchActiveIndex: SetState<number>;
  setTimeoutFn?: typeof window.setTimeout;
};

export const createNextSearchRequestId = (activeSearchRequestIdRef: MutableRefObject<number>) => {
  const requestId = activeSearchRequestIdRef.current + 1;
  activeSearchRequestIdRef.current = requestId;
  return requestId;
};

export const resetSearchExpandOverrides = ({
  setSearchExpandedDirSet,
  setSearchCollapsedDirSet,
}: SearchExpandOverrideSetters) => {
  setSearchExpandedDirSet(new Set());
  setSearchCollapsedDirSet(new Set());
};

export const applyEmptySearchState = ({
  setSearchResult,
  setSearchError,
  setSearchLoading,
  setSearchActiveIndex,
}: EmptySearchStateSetters) => {
  setSearchResult(null);
  setSearchError(null);
  setSearchLoading(false);
  setSearchActiveIndex(0);
};

export const scheduleSearchRequest = ({
  requestId,
  activeSearchRequestIdRef,
  normalizedQuery,
  debounceMs,
  fetchSearchPage,
  resolveErrorMessage,
  setSearchLoading,
  setSearchError,
  setSearchResult,
  setSearchActiveIndex,
  setTimeoutFn = window.setTimeout,
}: ScheduleSearchRequestInput) =>
  setTimeoutFn(() => {
    setSearchLoading(true);
    setSearchError(null);
    void fetchSearchPage(normalizedQuery)
      .then((nextPage) => {
        if (activeSearchRequestIdRef.current !== requestId) {
          return;
        }
        setSearchResult(nextPage);
        setSearchActiveIndex(0);
      })
      .catch((error) => {
        if (activeSearchRequestIdRef.current !== requestId) {
          return;
        }
        setSearchError(resolveErrorMessage(error));
      })
      .finally(() => {
        if (activeSearchRequestIdRef.current !== requestId) {
          return;
        }
        setSearchLoading(false);
      });
  }, debounceMs);
