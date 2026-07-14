import { describe, expect, it, vi } from "vitest";

import {
  createRefreshableSubscription,
  createTrackedPaneUpdater,
  detachOwnedPipesForShutdown,
  resolveShutdownPaneIds,
} from "./monitor";

describe("createRefreshableSubscription", () => {
  it("runs a refresh requested while the initial subscription is being created", async () => {
    const first = { stop: vi.fn(async () => undefined) };
    const second = { stop: vi.fn(async () => undefined) };
    let requestRefresh: () => void = () => undefined;
    const create = vi
      .fn<() => Promise<typeof first>>()
      .mockImplementationOnce(async () => {
        requestRefresh();
        return first;
      })
      .mockResolvedValueOnce(second);
    const controller = createRefreshableSubscription({ create });
    requestRefresh = controller.requestRefresh;

    await controller.start();
    await vi.waitFor(() => expect(create).toHaveBeenCalledTimes(2));

    expect(first.stop).toHaveBeenCalledOnce();
    await controller.stop();
    expect(second.stop).toHaveBeenCalledOnce();
  });

  it("stops a subscription created after shutdown began during refresh", async () => {
    const first = { stop: vi.fn(async () => undefined) };
    const second = { stop: vi.fn(async () => undefined) };
    let resolveSecond: (subscription: typeof second) => void = () => undefined;
    const create = vi
      .fn<() => Promise<typeof first>>()
      .mockResolvedValueOnce(first)
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveSecond = resolve;
        }),
      );
    const controller = createRefreshableSubscription({ create });
    await controller.start();

    controller.requestRefresh();
    await vi.waitFor(() => expect(create).toHaveBeenCalledTimes(2));
    const stopping = controller.stop();
    resolveSecond(second);
    await stopping;

    expect(first.stop).toHaveBeenCalledOnce();
    expect(second.stop).toHaveBeenCalledOnce();
  });

  it("retries a failed background refresh with backoff", async () => {
    vi.useFakeTimers();
    try {
      const subscription = { stop: vi.fn(async () => undefined) };
      const create = vi
        .fn<() => Promise<typeof subscription>>()
        .mockRejectedValueOnce(new Error("disconnected"))
        .mockResolvedValueOnce(subscription);
      const controller = createRefreshableSubscription({ create });

      controller.requestRefresh();
      await vi.advanceTimersByTimeAsync(999);
      expect(create).toHaveBeenCalledOnce();
      await vi.advanceTimersByTimeAsync(1);
      await vi.waitFor(() => expect(create).toHaveBeenCalledTimes(2));

      await controller.stop();
      expect(subscription.stop).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("createTrackedPaneUpdater", () => {
  it("coalesces concurrent updates and blocks re-entry after stop", async () => {
    let finishUpdate = () => {};
    const activeUpdate = new Promise<void>((resolve) => {
      finishUpdate = resolve;
    });
    const update = vi.fn(() => activeUpdate);
    const updater = createTrackedPaneUpdater(update);

    const first = updater.run();
    const second = updater.run();
    const stopping = updater.stop();

    expect(second).toBe(first);
    await Promise.resolve();
    expect(update).toHaveBeenCalledOnce();
    await updater.run();
    expect(update).toHaveBeenCalledOnce();

    let stopped = false;
    void stopping.then(() => {
      stopped = true;
    });
    await Promise.resolve();
    expect(stopped).toBe(false);

    finishUpdate();
    await stopping;
    expect(stopped).toBe(true);
    await updater.run();
    expect(update).toHaveBeenCalledOnce();
  });
});

describe("detachOwnedPipesForShutdown", () => {
  it("includes owned panes that failed before registry commit", () => {
    expect(resolveShutdownPaneIds(["%1"], ["%orphan", "%1"])).toEqual(["%1", "%orphan"]);
  });

  it("freshly checks every registered pane and waits for all detach attempts", async () => {
    const detachOwnedPipe = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, owned: true, detached: true })
      .mockRejectedValueOnce(new Error("pane disappeared"));

    await expect(
      detachOwnedPipesForShutdown({ paneIds: ["%1", "%2"], detachOwnedPipe }),
    ).resolves.toBeUndefined();

    expect(detachOwnedPipe).toHaveBeenNthCalledWith(1, "%1", { forceCheck: true });
    expect(detachOwnedPipe).toHaveBeenNthCalledWith(2, "%2", { forceCheck: true });
  });
});
