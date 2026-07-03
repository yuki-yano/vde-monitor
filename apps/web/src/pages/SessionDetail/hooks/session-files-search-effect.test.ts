import type { RepoFileSearchPage } from "@vde-monitor/shared";
import { describe, expect, it, vi } from "vitest";

import {
  applyEmptySearchState,
  createNextSearchRequestId,
  resetSearchExpandOverrides,
  runSearchRequest,
} from "./session-files-search-effect";
import type { SessionFilesUiAction } from "./useSessionFiles-ui-state-machine";

const findSetAction = (dispatch: ReturnType<typeof vi.fn>, key: string) =>
  dispatch.mock.calls
    .map(([action]) => action as SessionFilesUiAction)
    .filter(
      (action): action is Extract<SessionFilesUiAction, { type: "set" }> => action.type === "set",
    )
    .filter((action) => action.key === key);

describe("useSessionFiles search effect helpers", () => {
  it("increments request id ref", () => {
    const activeSearchRequestIdRef = { current: 4 };
    const requestId = createNextSearchRequestId(activeSearchRequestIdRef);
    expect(requestId).toBe(5);
    expect(activeSearchRequestIdRef.current).toBe(5);
  });

  it("resets search expand overrides", () => {
    const dispatch = vi.fn();
    resetSearchExpandOverrides(dispatch);
    expect(findSetAction(dispatch, "searchExpandedDirSet")[0]?.value).toBeInstanceOf(Set);
    expect(findSetAction(dispatch, "searchCollapsedDirSet")[0]?.value).toBeInstanceOf(Set);
  });

  it("applies empty search state", () => {
    const dispatch = vi.fn();
    applyEmptySearchState(dispatch);
    expect(findSetAction(dispatch, "searchResult")[0]?.value).toBeNull();
    expect(findSetAction(dispatch, "searchError")[0]?.value).toBeNull();
    expect(findSetAction(dispatch, "searchLoading")[0]?.value).toBe(false);
    expect(findSetAction(dispatch, "searchActiveIndex")[0]?.value).toBe(0);
  });

  it("runs the search request and applies response when request is current", async () => {
    const page: RepoFileSearchPage = {
      query: "index",
      items: [],
      truncated: false,
      totalMatchedCount: 0,
    };
    const fetchSearchPage = vi.fn(async () => page);
    const dispatch = vi.fn();
    const activeSearchRequestIdRef = { current: 10 };

    await runSearchRequest({
      requestId: 10,
      activeSearchRequestIdRef,
      normalizedQuery: "index",
      fetchSearchPage,
      resolveErrorMessage: () => "error",
      dispatch,
    });

    expect(fetchSearchPage).toHaveBeenCalledWith("index");
    expect(findSetAction(dispatch, "searchLoading").map((action) => action.value)).toEqual([
      true,
      false,
    ]);
    expect(findSetAction(dispatch, "searchError")[0]?.value).toBeNull();
    expect(findSetAction(dispatch, "searchResult")[0]?.value).toEqual(page);
    expect(findSetAction(dispatch, "searchActiveIndex")[0]?.value).toBe(0);
  });

  it("ignores stale search result update when request id changed", async () => {
    const deferred = { resolve: (() => undefined) as (value: RepoFileSearchPage) => void };
    const fetchSearchPage = vi.fn(
      () =>
        new Promise<RepoFileSearchPage>((nextResolve) => {
          deferred.resolve = nextResolve;
        }),
    );
    const dispatch = vi.fn();
    const activeSearchRequestIdRef = { current: 20 };

    const runPromise = runSearchRequest({
      requestId: 20,
      activeSearchRequestIdRef,
      normalizedQuery: "index",
      fetchSearchPage,
      resolveErrorMessage: () => "error",
      dispatch,
    });
    activeSearchRequestIdRef.current = 21;
    deferred.resolve({
      query: "index",
      items: [],
      truncated: false,
      totalMatchedCount: 0,
    });
    await runPromise;

    expect(findSetAction(dispatch, "searchLoading").map((action) => action.value)).toEqual([true]);
    expect(findSetAction(dispatch, "searchResult")).toHaveLength(0);
    expect(findSetAction(dispatch, "searchActiveIndex")).toHaveLength(0);
  });
});
