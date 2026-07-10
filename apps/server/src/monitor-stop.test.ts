import { describe, expect, it, vi } from "vitest";

import {
  createTrackedPaneUpdater,
  detachOwnedPipesForShutdown,
  resolveShutdownPaneIds,
} from "./monitor";

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
