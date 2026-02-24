import { act, renderHook, waitFor } from "@testing-library/react";
import { Provider as JotaiProvider, createStore } from "jotai";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { commitStateAtom, initialCommitState } from "../atoms/commitAtoms";
import {
  createCommitDetail,
  createCommitFileDiff,
  createCommitLog,
  createDeferred,
} from "../test-helpers";
import { useSessionCommits } from "./useSessionCommits";

describe("useSessionCommits", () => {
  const createWrapper = () => {
    const store = createStore();
    store.set(commitStateAtom, initialCommitState);
    return ({ children }: { children: ReactNode }) => (
      <JotaiProvider store={store}>{children}</JotaiProvider>
    );
  };

  it("loads commit log on mount", async () => {
    const commitLog = createCommitLog();
    const requestCommitLog = vi.fn().mockResolvedValue(commitLog);
    const requestCommitDetail = vi.fn().mockResolvedValue(createCommitDetail());
    const requestCommitFile = vi.fn().mockResolvedValue(createCommitFileDiff());

    const wrapper = createWrapper();
    const { result } = renderHook(
      () =>
        useSessionCommits({
          paneId: "pane-1",
          connected: true,
          requestCommitLog,
          requestCommitDetail,
          requestCommitFile,
        }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.commitLog).not.toBeNull();
    });

    expect(requestCommitLog).toHaveBeenCalledWith("pane-1", {
      limit: 10,
      skip: 0,
      force: true,
    });
  });

  it("loads commit detail on toggle", async () => {
    const commitLog = createCommitLog();
    const requestCommitLog = vi.fn().mockResolvedValue(commitLog);
    const requestCommitDetail = vi.fn().mockResolvedValue(createCommitDetail());
    const requestCommitFile = vi.fn().mockResolvedValue(createCommitFileDiff());

    const wrapper = createWrapper();
    const { result } = renderHook(
      () =>
        useSessionCommits({
          paneId: "pane-1",
          connected: true,
          requestCommitLog,
          requestCommitDetail,
          requestCommitFile,
        }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.commitLog).not.toBeNull();
    });

    act(() => {
      result.current.toggleCommit("abc123");
    });

    await waitFor(() => {
      expect(requestCommitDetail).toHaveBeenCalledWith("pane-1", "abc123", { force: true });
    });
  });

  it("copies commit hash to clipboard", async () => {
    const commitLog = createCommitLog();
    const requestCommitLog = vi.fn().mockResolvedValue(commitLog);
    const requestCommitDetail = vi.fn().mockResolvedValue(createCommitDetail());
    const requestCommitFile = vi.fn().mockResolvedValue(createCommitFileDiff());
    const writeText = vi.fn().mockResolvedValue(undefined);

    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    const wrapper = createWrapper();
    const { result } = renderHook(
      () =>
        useSessionCommits({
          paneId: "pane-1",
          connected: true,
          requestCommitLog,
          requestCommitDetail,
          requestCommitFile,
        }),
      { wrapper },
    );

    await act(async () => {
      await result.current.copyHash("abc123");
    });

    expect(writeText).toHaveBeenCalledWith("abc123");
  });

  it("reloads commit log when reconnected", async () => {
    const commitLog = createCommitLog();
    const requestCommitLog = vi.fn().mockResolvedValue(commitLog);
    const requestCommitDetail = vi.fn().mockResolvedValue(createCommitDetail());
    const requestCommitFile = vi.fn().mockResolvedValue(createCommitFileDiff());

    const wrapper = createWrapper();
    const { rerender } = renderHook(
      ({ connected }) =>
        useSessionCommits({
          paneId: "pane-1",
          connected,
          requestCommitLog,
          requestCommitDetail,
          requestCommitFile,
        }),
      {
        wrapper,
        initialProps: { connected: false },
      },
    );

    await waitFor(() => {
      expect(requestCommitLog).toHaveBeenCalledTimes(1);
    });

    rerender({ connected: true });

    await waitFor(() => {
      expect(requestCommitLog).toHaveBeenCalledTimes(2);
    });
    expect(requestCommitLog).toHaveBeenLastCalledWith("pane-1", {
      limit: 10,
      skip: 0,
      force: true,
    });
  });

  it("ignores stale commit log responses from previous pane", async () => {
    const pane1Log = createCommitLog({ rev: "rev-pane-1" });
    const pane2Log = createCommitLog({ rev: "rev-pane-2" });
    const pane1Deferred = createDeferred<typeof pane1Log>();
    const requestCommitLog = vi.fn((paneId: string) =>
      paneId === "pane-1" ? pane1Deferred.promise : Promise.resolve(pane2Log),
    );
    const requestCommitDetail = vi.fn().mockResolvedValue(createCommitDetail());
    const requestCommitFile = vi.fn().mockResolvedValue(createCommitFileDiff());

    const wrapper = createWrapper();
    const { result, rerender } = renderHook(
      ({ paneId }) =>
        useSessionCommits({
          paneId,
          connected: true,
          requestCommitLog,
          requestCommitDetail,
          requestCommitFile,
        }),
      {
        wrapper,
        initialProps: { paneId: "pane-1" },
      },
    );

    rerender({ paneId: "pane-2" });

    await waitFor(() => {
      expect(result.current.commitLog?.rev).toBe("rev-pane-2");
    });

    pane1Deferred.resolve(pane1Log);

    await waitFor(() => {
      expect(result.current.commitLog?.rev).toBe("rev-pane-2");
    });
  });

  it("keeps the newest commit log when refresh requests resolve out of order", async () => {
    const staleLog = createCommitLog({ rev: "rev-stale" });
    const freshLog = createCommitLog({ rev: "rev-fresh" });
    const staleDeferred = createDeferred<typeof staleLog>();
    const freshDeferred = createDeferred<typeof freshLog>();
    const requestCommitLog = vi
      .fn()
      .mockImplementationOnce(() => staleDeferred.promise)
      .mockImplementationOnce(() => freshDeferred.promise);
    const requestCommitDetail = vi.fn().mockResolvedValue(createCommitDetail());
    const requestCommitFile = vi.fn().mockResolvedValue(createCommitFileDiff());

    const wrapper = createWrapper();
    const { result } = renderHook(
      () =>
        useSessionCommits({
          paneId: "pane-1",
          connected: true,
          requestCommitLog,
          requestCommitDetail,
          requestCommitFile,
        }),
      { wrapper },
    );

    void result.current.refreshCommitLog();
    freshDeferred.resolve(freshLog);

    await waitFor(() => {
      expect(result.current.commitLog?.rev).toBe("rev-fresh");
    });

    staleDeferred.resolve(staleLog);

    await waitFor(() => {
      expect(result.current.commitLog?.rev).toBe("rev-fresh");
    });
  });
});
