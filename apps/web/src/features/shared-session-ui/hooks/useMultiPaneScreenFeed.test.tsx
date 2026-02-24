import { act, renderHook, waitFor } from "@testing-library/react";
import type { ScreenResponse } from "@vde-monitor/shared";
import { Provider as JotaiProvider, createStore } from "jotai";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getScreenCacheAtom,
  getScreenCacheErrorAtom,
  getScreenCacheLoadingAtom,
} from "../atoms/screenCacheAtoms";
import { useMultiPaneScreenFeed } from "./useMultiPaneScreenFeed";

type RequestScreen = (
  paneId: string,
  options: { lines?: number; mode?: "text" | "image"; cursor?: string },
) => Promise<ScreenResponse>;

const createWrapper = (cacheKey: string) => {
  const store = createStore();
  store.set(getScreenCacheAtom(cacheKey), {});
  store.set(getScreenCacheLoadingAtom(cacheKey), {});
  store.set(getScreenCacheErrorAtom(cacheKey), {});
  return ({ children }: { children: ReactNode }) => (
    <JotaiProvider store={store}>{children}</JotaiProvider>
  );
};

describe("useMultiPaneScreenFeed", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    Object.defineProperty(document, "hidden", { value: false, configurable: true });
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
  });

  it("polls pane ids in configured concurrency batches", async () => {
    const pendingResolvers: Array<() => void> = [];
    const requestScreen = vi.fn<RequestScreen>((paneId: string) => {
      return new Promise<ScreenResponse>((resolve) => {
        pendingResolvers.push(() => {
          resolve({
            ok: true,
            paneId,
            mode: "text",
            capturedAt: new Date(0).toISOString(),
            screen: paneId,
          });
        });
      });
    });
    const wrapper = createWrapper("multi-pane-feed-concurrency");

    const { result } = renderHook(
      () =>
        useMultiPaneScreenFeed({
          paneIds: ["pane-1", "pane-2", "pane-3"],
          retainedPaneIds: ["pane-1", "pane-2", "pane-3"],
          enabled: false,
          connected: true,
          connectionIssue: null,
          requestScreen,
          cacheKey: "multi-pane-feed-concurrency",
          concurrency: 2,
        }),
      { wrapper },
    );

    let pollPromise: Promise<void> | null = null;
    await act(async () => {
      pollPromise = result.current.pollNow();
      await Promise.resolve();
    });
    expect(requestScreen).toHaveBeenCalledTimes(2);
    pendingResolvers[0]?.();
    pendingResolvers[1]?.();

    await act(async () => {
      await Promise.resolve();
    });
    expect(requestScreen).toHaveBeenCalledTimes(3);
    pendingResolvers[2]?.();

    await act(async () => {
      await pollPromise;
    });
  });

  it("runs initial poll when enabled", async () => {
    const requestScreen = vi.fn<RequestScreen>().mockResolvedValue({
      ok: true,
      paneId: "pane-1",
      mode: "text",
      capturedAt: new Date(0).toISOString(),
      screen: "line",
    });
    const wrapper = createWrapper("multi-pane-feed-polling");

    renderHook(
      () =>
        useMultiPaneScreenFeed({
          paneIds: ["pane-1"],
          retainedPaneIds: ["pane-1"],
          enabled: true,
          connected: true,
          connectionIssue: null,
          requestScreen,
          cacheKey: "multi-pane-feed-polling",
          intervalMs: 1000,
        }),
      { wrapper },
    );

    await waitFor(() => {
      expect(requestScreen).toHaveBeenCalledTimes(1);
    });
  });

  it("skips initial poll when fetchOnMount is disabled", async () => {
    const requestScreen = vi.fn<RequestScreen>().mockResolvedValue({
      ok: true,
      paneId: "pane-1",
      mode: "text",
      capturedAt: new Date(0).toISOString(),
      screen: "line",
    });
    const wrapper = createWrapper("multi-pane-feed-fetch-on-mount-disabled");

    renderHook(
      () =>
        useMultiPaneScreenFeed({
          paneIds: ["pane-1"],
          retainedPaneIds: ["pane-1"],
          enabled: true,
          connected: true,
          connectionIssue: null,
          requestScreen,
          cacheKey: "multi-pane-feed-fetch-on-mount-disabled",
          intervalMs: 1000,
          fetchOnMount: false,
        }),
      { wrapper },
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(requestScreen).not.toHaveBeenCalled();
  });

  it("skips polling when shouldPoll returns false", async () => {
    vi.useFakeTimers();
    const requestScreen = vi.fn<RequestScreen>().mockResolvedValue({
      ok: true,
      paneId: "pane-1",
      mode: "text",
      capturedAt: new Date(0).toISOString(),
      screen: "line",
    });
    const wrapper = createWrapper("multi-pane-feed-should-poll");

    renderHook(
      () =>
        useMultiPaneScreenFeed({
          paneIds: ["pane-1"],
          retainedPaneIds: ["pane-1"],
          enabled: true,
          connected: true,
          connectionIssue: null,
          requestScreen,
          cacheKey: "multi-pane-feed-should-poll",
          intervalMs: 1000,
          shouldPoll: () => false,
        }),
      { wrapper },
    );

    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    expect(requestScreen).not.toHaveBeenCalled();
  });

  it("prunes stale cache entries based on retained pane ids", async () => {
    const requestScreen = vi.fn<RequestScreen>().mockImplementation(async (paneId: string) => ({
      ok: true,
      paneId,
      mode: "text",
      capturedAt: new Date(0).toISOString(),
      screen: paneId,
    }));
    const wrapper = createWrapper("multi-pane-feed-prune");

    const { result, rerender } = renderHook(
      (props: { retainedPaneIds: string[] }) =>
        useMultiPaneScreenFeed({
          paneIds: ["pane-1", "pane-2"],
          retainedPaneIds: props.retainedPaneIds,
          enabled: false,
          connected: true,
          connectionIssue: null,
          requestScreen,
          cacheKey: "multi-pane-feed-prune",
        }),
      {
        wrapper,
        initialProps: { retainedPaneIds: ["pane-1", "pane-2"] },
      },
    );

    await act(async () => {
      await result.current.fetchPane("pane-1");
      await result.current.fetchPane("pane-2");
    });

    await waitFor(() => {
      expect(result.current.cache["pane-1"]).toBeDefined();
      expect(result.current.cache["pane-2"]).toBeDefined();
    });

    rerender({ retainedPaneIds: ["pane-1"] });

    await waitFor(() => {
      expect(result.current.cache["pane-1"]).toBeDefined();
      expect(result.current.cache["pane-2"]).toBeUndefined();
    });
  });

  it("continues polling when a pane request fails", async () => {
    const requestScreen = vi.fn<RequestScreen>().mockImplementation(async (paneId: string) => {
      if (paneId === "pane-1") {
        throw new Error("boom");
      }
      return {
        ok: true,
        paneId,
        mode: "text",
        capturedAt: new Date(0).toISOString(),
        screen: paneId,
      };
    });
    const wrapper = createWrapper("multi-pane-feed-partial-failures");

    const { result } = renderHook(
      () =>
        useMultiPaneScreenFeed({
          paneIds: ["pane-1", "pane-2"],
          retainedPaneIds: ["pane-1", "pane-2"],
          enabled: false,
          connected: true,
          connectionIssue: null,
          requestScreen,
          cacheKey: "multi-pane-feed-partial-failures",
          concurrency: 2,
        }),
      { wrapper },
    );

    await act(async () => {
      await result.current.pollNow();
    });

    await waitFor(() => {
      expect(result.current.error["pane-1"]).toBe("boom");
      expect(result.current.cache["pane-2"]?.screen).toBe("pane-2");
    });
  });
});
