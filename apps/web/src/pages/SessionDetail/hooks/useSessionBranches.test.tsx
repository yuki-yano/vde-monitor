import { act, renderHook, waitFor } from "@testing-library/react";
import type { BranchList } from "@vde-monitor/shared";
import { describe, expect, it, vi } from "vitest";

import { createDeferred } from "../test-helpers";
import { useSessionBranches } from "./useSessionBranches";

const buildBranchList = (paneId: string): BranchList => ({
  repoRoot: `/repo/${paneId}`,
  defaultBranch: "main",
  currentBranch: paneId,
  entries: [],
});

describe("useSessionBranches", () => {
  it("does not refresh the previous pane after its mutation finishes", async () => {
    const mutationDeferred = createDeferred<void>();
    const callerSideEffect = vi.fn();
    const requestBranches = vi.fn(async (paneId: string) => buildBranchList(paneId));
    const requestBranchCheckout = vi.fn(() => mutationDeferred.promise);
    const requestBranchCreate = vi.fn(async () => undefined);
    const requestBranchDelete = vi.fn(async () => undefined);

    const { result, rerender } = renderHook(
      ({ paneId }) =>
        useSessionBranches({
          paneId,
          connected: false,
          session: null,
          requestBranches,
          requestBranchCheckout,
          requestBranchCreate,
          requestBranchDelete,
        }),
      { initialProps: { paneId: "pane-a" } },
    );

    await waitFor(() => {
      expect(result.current.currentBranch).toBe("pane-a");
    });
    let mutationPromise: Promise<boolean> | undefined;
    act(() => {
      mutationPromise = result.current.checkoutBranch("feature/a").then((succeeded) => {
        if (succeeded) {
          callerSideEffect();
        }
        return succeeded;
      });
    });

    rerender({ paneId: "pane-b" });
    await waitFor(() => {
      expect(result.current.currentBranch).toBe("pane-b");
    });

    let mutationResult: boolean | undefined;
    await act(async () => {
      mutationDeferred.resolve();
      mutationResult = await mutationPromise;
    });

    expect(mutationResult).toBe(false);
    expect(callerSideEffect).not.toHaveBeenCalled();
    expect(result.current.currentBranch).toBe("pane-b");
    expect(requestBranches.mock.calls.map(([paneId]) => paneId)).toEqual(["pane-a", "pane-b"]);
  });

  it("cancels an old mutation when navigation returns to the same pane id", async () => {
    const mutationDeferred = createDeferred<void>();
    const callerSideEffect = vi.fn();
    const requestBranches = vi.fn(async (paneId: string) => buildBranchList(paneId));
    const requestBranchCheckout = vi.fn(() => mutationDeferred.promise);
    const requestBranchCreate = vi.fn(async () => undefined);
    const requestBranchDelete = vi.fn(async () => undefined);

    const { result, rerender } = renderHook(
      ({ paneId }) =>
        useSessionBranches({
          paneId,
          connected: false,
          session: null,
          requestBranches,
          requestBranchCheckout,
          requestBranchCreate,
          requestBranchDelete,
        }),
      { initialProps: { paneId: "pane-a" } },
    );

    await waitFor(() => {
      expect(result.current.currentBranch).toBe("pane-a");
    });
    let mutationPromise: Promise<boolean> | undefined;
    act(() => {
      mutationPromise = result.current.checkoutBranch("feature/a").then((succeeded) => {
        if (succeeded) {
          callerSideEffect();
        }
        return succeeded;
      });
    });

    rerender({ paneId: "pane-b" });
    await waitFor(() => {
      expect(result.current.currentBranch).toBe("pane-b");
    });
    rerender({ paneId: "pane-a" });
    await waitFor(() => {
      expect(requestBranches).toHaveBeenCalledTimes(3);
      expect(result.current.currentBranch).toBe("pane-a");
    });

    let mutationResult: boolean | undefined;
    await act(async () => {
      mutationDeferred.resolve();
      mutationResult = await mutationPromise;
    });

    expect(mutationResult).toBe(false);
    expect(callerSideEffect).not.toHaveBeenCalled();
    expect(requestBranches.mock.calls.map(([paneId]) => paneId)).toEqual([
      "pane-a",
      "pane-b",
      "pane-a",
    ]);
  });

  it("cancels caller-side effects when the pane changes during the post-mutation refresh", async () => {
    const refreshDeferred = createDeferred<BranchList>();
    const callerSideEffect = vi.fn();
    const requestBranches = vi.fn((paneId: string) => {
      if (paneId === "pane-a" && requestBranches.mock.calls.length === 2) {
        return refreshDeferred.promise;
      }
      return Promise.resolve(buildBranchList(paneId));
    });
    const requestBranchCheckout = vi.fn(async () => undefined);
    const requestBranchCreate = vi.fn(async () => undefined);
    const requestBranchDelete = vi.fn(async () => undefined);

    const { result, rerender } = renderHook(
      ({ paneId }) =>
        useSessionBranches({
          paneId,
          connected: false,
          session: null,
          requestBranches,
          requestBranchCheckout,
          requestBranchCreate,
          requestBranchDelete,
        }),
      { initialProps: { paneId: "pane-a" } },
    );

    await waitFor(() => {
      expect(result.current.currentBranch).toBe("pane-a");
    });
    let mutationPromise: Promise<boolean> | undefined;
    act(() => {
      mutationPromise = result.current.checkoutBranch("feature/a").then((succeeded) => {
        if (succeeded) {
          callerSideEffect();
        }
        return succeeded;
      });
    });
    await waitFor(() => {
      expect(requestBranches).toHaveBeenCalledTimes(2);
    });

    rerender({ paneId: "pane-b" });
    await waitFor(() => {
      expect(result.current.currentBranch).toBe("pane-b");
    });

    let mutationResult: boolean | undefined;
    await act(async () => {
      refreshDeferred.resolve(buildBranchList("pane-a"));
      mutationResult = await mutationPromise;
    });

    expect(mutationResult).toBe(false);
    expect(callerSideEffect).not.toHaveBeenCalled();
    expect(result.current.currentBranch).toBe("pane-b");
  });
});
