import type { RepoFileSearchPage } from "@vde-monitor/shared";
import { describe, expect, it, vi } from "vitest";

import {
  applyEmptySearchState,
  createNextSearchRequestId,
  resetSearchExpandOverrides,
  scheduleSearchRequest,
} from "./useSessionFiles-search-effect";

const flushMicrotasks = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

describe("useSessionFiles search effect helpers", () => {
  it("increments request id ref", () => {
    const activeSearchRequestIdRef = { current: 4 };
    const requestId = createNextSearchRequestId(activeSearchRequestIdRef);
    expect(requestId).toBe(5);
    expect(activeSearchRequestIdRef.current).toBe(5);
  });

  it("resets search expand overrides", () => {
    const setSearchExpandedDirSet = vi.fn();
    const setSearchCollapsedDirSet = vi.fn();
    resetSearchExpandOverrides({
      setSearchExpandedDirSet,
      setSearchCollapsedDirSet,
    });
    expect((setSearchExpandedDirSet.mock.calls[0] ?? [])[0]).toBeInstanceOf(Set);
    expect((setSearchCollapsedDirSet.mock.calls[0] ?? [])[0]).toBeInstanceOf(Set);
  });

  it("applies empty search state", () => {
    const setSearchResult = vi.fn();
    const setSearchError = vi.fn();
    const setSearchLoading = vi.fn();
    const setSearchActiveIndex = vi.fn();
    applyEmptySearchState({
      setSearchResult,
      setSearchError,
      setSearchLoading,
      setSearchActiveIndex,
    });
    expect(setSearchResult).toHaveBeenCalledWith(null);
    expect(setSearchError).toHaveBeenCalledWith(null);
    expect(setSearchLoading).toHaveBeenCalledWith(false);
    expect(setSearchActiveIndex).toHaveBeenCalledWith(0);
  });

  it("schedules debounced search and applies response when request is current", async () => {
    vi.useFakeTimers();
    const page: RepoFileSearchPage = {
      query: "index",
      items: [],
      truncated: false,
      totalMatchedCount: 0,
    };
    const fetchSearchPage = vi.fn(async () => page);
    const setSearchLoading = vi.fn();
    const setSearchError = vi.fn();
    const setSearchResult = vi.fn();
    const setSearchActiveIndex = vi.fn();
    const activeSearchRequestIdRef = { current: 10 };

    scheduleSearchRequest({
      requestId: 10,
      activeSearchRequestIdRef,
      normalizedQuery: "index",
      debounceMs: 120,
      fetchSearchPage,
      resolveErrorMessage: () => "error",
      setSearchLoading,
      setSearchError,
      setSearchResult,
      setSearchActiveIndex,
    });
    vi.advanceTimersByTime(120);
    await flushMicrotasks();

    expect(fetchSearchPage).toHaveBeenCalledWith("index");
    expect(setSearchLoading).toHaveBeenCalledWith(true);
    expect(setSearchError).toHaveBeenCalledWith(null);
    expect(setSearchResult).toHaveBeenCalledWith(page);
    expect(setSearchActiveIndex).toHaveBeenCalledWith(0);
    expect(setSearchLoading).toHaveBeenLastCalledWith(false);
    vi.useRealTimers();
  });

  it("ignores stale search result update when request id changed", async () => {
    vi.useFakeTimers();
    const deferred = { resolve: (() => undefined) as (value: RepoFileSearchPage) => void };
    const fetchSearchPage = vi.fn(
      () =>
        new Promise<RepoFileSearchPage>((nextResolve) => {
          deferred.resolve = nextResolve;
        }),
    );
    const setSearchLoading = vi.fn();
    const setSearchError = vi.fn();
    const setSearchResult = vi.fn();
    const setSearchActiveIndex = vi.fn();
    const activeSearchRequestIdRef = { current: 20 };

    scheduleSearchRequest({
      requestId: 20,
      activeSearchRequestIdRef,
      normalizedQuery: "index",
      debounceMs: 120,
      fetchSearchPage,
      resolveErrorMessage: () => "error",
      setSearchLoading,
      setSearchError,
      setSearchResult,
      setSearchActiveIndex,
    });
    vi.advanceTimersByTime(120);
    activeSearchRequestIdRef.current = 21;
    deferred.resolve({
      query: "index",
      items: [],
      truncated: false,
      totalMatchedCount: 0,
    });
    await flushMicrotasks();

    expect(setSearchLoading).toHaveBeenCalledWith(true);
    expect(setSearchResult).not.toHaveBeenCalled();
    expect(setSearchActiveIndex).not.toHaveBeenCalled();
    expect(setSearchLoading).not.toHaveBeenCalledWith(false);
    vi.useRealTimers();
  });
});
