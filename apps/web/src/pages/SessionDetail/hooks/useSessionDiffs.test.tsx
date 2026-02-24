import { QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { Provider as JotaiProvider, createStore } from "jotai";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { createQueryClient } from "@/state/query-client";

import {
  diffErrorAtom,
  diffFilesAtom,
  diffLoadingAtom,
  diffLoadingFilesAtom,
  diffOpenAtom,
  diffSummaryAtom,
} from "../atoms/diffAtoms";
import { createDeferred, createDiffFile, createDiffSummary } from "../test-helpers";
import { useSessionDiffs } from "./useSessionDiffs";

describe("useSessionDiffs", () => {
  const createWrapper = () => {
    const queryClient = createQueryClient();
    const store = createStore();
    store.set(diffSummaryAtom, null);
    store.set(diffErrorAtom, null);
    store.set(diffLoadingAtom, false);
    store.set(diffFilesAtom, {});
    store.set(diffOpenAtom, {});
    store.set(diffLoadingFilesAtom, {});
    return ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        <JotaiProvider store={store}>{children}</JotaiProvider>
      </QueryClientProvider>
    );
  };

  it("loads diff summary on mount", async () => {
    const diffSummary = createDiffSummary();
    const requestDiffSummary = vi.fn().mockResolvedValue(diffSummary);
    const requestDiffFile = vi.fn().mockResolvedValue(createDiffFile());

    const wrapper = createWrapper();
    const { result } = renderHook(
      () =>
        useSessionDiffs({
          paneId: "pane-1",
          connected: true,
          requestDiffSummary,
          requestDiffFile,
        }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.diffSummary).not.toBeNull();
    });

    expect(requestDiffSummary).toHaveBeenCalledWith("pane-1", { force: true });
  });

  it("loads diff file when toggled open", async () => {
    const diffSummary = createDiffSummary();
    const requestDiffSummary = vi.fn().mockResolvedValue(diffSummary);
    const requestDiffFile = vi.fn().mockResolvedValue(createDiffFile());

    const wrapper = createWrapper();
    const { result } = renderHook(
      () =>
        useSessionDiffs({
          paneId: "pane-1",
          connected: true,
          requestDiffSummary,
          requestDiffFile,
        }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.diffSummary).not.toBeNull();
    });

    result.current.toggleDiff("src/index.ts");

    await waitFor(() => {
      expect(requestDiffFile).toHaveBeenCalledWith("pane-1", "src/index.ts", "HEAD", {
        force: true,
      });
    });
  });

  it("loads diff file without toggling open state", async () => {
    const diffSummary = createDiffSummary();
    const requestDiffSummary = vi.fn().mockResolvedValue(diffSummary);
    const requestDiffFile = vi.fn().mockResolvedValue(createDiffFile());

    const wrapper = createWrapper();
    const { result } = renderHook(
      () =>
        useSessionDiffs({
          paneId: "pane-1",
          connected: true,
          requestDiffSummary,
          requestDiffFile,
        }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.diffSummary).not.toBeNull();
    });

    result.current.ensureDiffFile("src/index.ts");

    await waitFor(() => {
      expect(requestDiffFile).toHaveBeenCalledWith("pane-1", "src/index.ts", "HEAD", {
        force: true,
      });
    });
    expect(result.current.diffOpen["src/index.ts"]).toBeUndefined();
  });

  it("reloads diff summary when reconnected", async () => {
    const diffSummary = createDiffSummary();
    const requestDiffSummary = vi.fn().mockResolvedValue(diffSummary);
    const requestDiffFile = vi.fn().mockResolvedValue(createDiffFile());

    const wrapper = createWrapper();
    const { rerender } = renderHook(
      ({ connected }) =>
        useSessionDiffs({
          paneId: "pane-1",
          connected,
          requestDiffSummary,
          requestDiffFile,
        }),
      {
        wrapper,
        initialProps: { connected: false },
      },
    );

    await waitFor(() => {
      expect(requestDiffSummary).toHaveBeenCalledTimes(1);
    });

    rerender({ connected: true });

    await waitFor(() => {
      expect(requestDiffSummary).toHaveBeenCalledTimes(2);
    });
    expect(requestDiffSummary).toHaveBeenLastCalledWith("pane-1", { force: true });
  });

  it("ignores stale diff summary responses from previous pane", async () => {
    const pane1Summary = createDiffSummary({ rev: "rev-pane-1", files: [] });
    const pane2Summary = createDiffSummary({
      rev: "rev-pane-2",
      files: [{ path: "pane-2.ts", status: "M", staged: false, additions: 1, deletions: 0 }],
    });
    const pane1Deferred = createDeferred<typeof pane1Summary>();
    const requestDiffSummary = vi.fn((paneId: string) =>
      paneId === "pane-1" ? pane1Deferred.promise : Promise.resolve(pane2Summary),
    );
    const requestDiffFile = vi.fn().mockResolvedValue(createDiffFile());

    const wrapper = createWrapper();
    const { result, rerender } = renderHook(
      ({ paneId }) =>
        useSessionDiffs({
          paneId,
          connected: true,
          requestDiffSummary,
          requestDiffFile,
        }),
      {
        wrapper,
        initialProps: { paneId: "pane-1" },
      },
    );

    rerender({ paneId: "pane-2" });

    await waitFor(() => {
      expect(result.current.diffSummary?.rev).toBe("rev-pane-2");
    });

    pane1Deferred.resolve(pane1Summary);

    await waitFor(() => {
      expect(result.current.diffSummary?.rev).toBe("rev-pane-2");
    });
  });

  it("keeps the newest summary when refresh requests resolve out of order", async () => {
    const staleSummary = createDiffSummary({ rev: "rev-stale" });
    const freshSummary = createDiffSummary({ rev: "rev-fresh" });
    const staleDeferred = createDeferred<typeof staleSummary>();
    const freshDeferred = createDeferred<typeof freshSummary>();
    const requestDiffSummary = vi
      .fn()
      .mockImplementationOnce(() => staleDeferred.promise)
      .mockImplementationOnce(() => freshDeferred.promise);
    const requestDiffFile = vi.fn().mockResolvedValue(createDiffFile());

    const wrapper = createWrapper();
    const { result } = renderHook(
      () =>
        useSessionDiffs({
          paneId: "pane-1",
          connected: true,
          requestDiffSummary,
          requestDiffFile,
        }),
      { wrapper },
    );

    void result.current.refreshDiff();
    freshDeferred.resolve(freshSummary);

    await waitFor(() => {
      expect(result.current.diffSummary?.rev).toBe("rev-fresh");
    });

    staleDeferred.resolve(staleSummary);

    await waitFor(() => {
      expect(result.current.diffSummary?.rev).toBe("rev-fresh");
    });
  });

  it("clears previous pane diff-file cache on pane switch", async () => {
    const pane1Summary = createDiffSummary({ rev: "rev-pane-1" });
    const pane2Summary = createDiffSummary({ rev: "rev-pane-2" });
    const requestDiffSummary = vi.fn((paneId: string) =>
      Promise.resolve(paneId === "pane-1" ? pane1Summary : pane2Summary),
    );
    const requestDiffFile = vi.fn().mockResolvedValue(createDiffFile());

    const wrapper = createWrapper();
    const { result, rerender } = renderHook(
      ({ paneId }) =>
        useSessionDiffs({
          paneId,
          connected: true,
          requestDiffSummary,
          requestDiffFile,
        }),
      {
        wrapper,
        initialProps: { paneId: "pane-1" },
      },
    );

    await waitFor(() => {
      expect(result.current.diffSummary?.rev).toBe("rev-pane-1");
    });

    result.current.toggleDiff("src/index.ts");

    await waitFor(() => {
      expect(requestDiffFile).toHaveBeenCalledTimes(1);
    });

    rerender({ paneId: "pane-2" });

    await waitFor(() => {
      expect(result.current.diffSummary?.rev).toBe("rev-pane-2");
    });

    rerender({ paneId: "pane-1" });

    await waitFor(() => {
      expect(result.current.diffSummary?.rev).toBe("rev-pane-1");
    });

    result.current.toggleDiff("src/index.ts");

    await waitFor(() => {
      expect(requestDiffFile).toHaveBeenCalledTimes(2);
    });
    expect(requestDiffFile).toHaveBeenLastCalledWith("pane-1", "src/index.ts", "rev-pane-1", {
      force: true,
    });
  });

  it("reuses cached open diff files when summary refresh keeps same rev", async () => {
    const diffSummary = createDiffSummary({
      rev: "HEAD",
      files: [{ path: "src/index.ts", status: "M", staged: false, additions: 1, deletions: 0 }],
    });
    const requestDiffSummary = vi.fn().mockResolvedValue(diffSummary);
    const requestDiffFile = vi.fn().mockResolvedValue(createDiffFile());

    const wrapper = createWrapper();
    const { result } = renderHook(
      () =>
        useSessionDiffs({
          paneId: "pane-1",
          connected: true,
          requestDiffSummary,
          requestDiffFile,
        }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.diffSummary?.rev).toBe("HEAD");
    });

    result.current.toggleDiff("src/index.ts");

    await waitFor(() => {
      expect(requestDiffFile).toHaveBeenCalledTimes(1);
    });

    await result.current.refreshDiff();

    await waitFor(() => {
      expect(requestDiffSummary).toHaveBeenCalledTimes(2);
    });
    expect(requestDiffFile).toHaveBeenCalledTimes(1);
  });
});
