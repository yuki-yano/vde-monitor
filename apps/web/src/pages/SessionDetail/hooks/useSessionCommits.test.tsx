// @vitest-environment happy-dom
import { act, renderHook, waitFor } from "@testing-library/react";
import { createStore, Provider as JotaiProvider } from "jotai";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { commitStateAtom, initialCommitState } from "../atoms/commitAtoms";
import { createCommitDetail, createCommitFileDiff, createCommitLog } from "../test-helpers";
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
});
