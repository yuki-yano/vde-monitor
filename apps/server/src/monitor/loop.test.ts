import { describe, expect, it, vi } from "vitest";

import { createMonitorLoop } from "./loop";

describe("createMonitorLoop", () => {
  it("invokes update and rotate on tick", async () => {
    vi.useFakeTimers();
    const updateFromPanes = vi.fn(async () => {});
    const rotateLogIfNeeded = vi.fn(async () => {});
    const loop = createMonitorLoop(
      {
        intervalMs: 1000,
        eventLogPath: "/tmp/events.log",
        maxEventLogBytes: 10,
        retainRotations: 1,
        updateFromPanes,
      },
      { rotateLogIfNeeded },
    );

    loop.start();
    await vi.advanceTimersByTimeAsync(1000);
    expect(updateFromPanes).toHaveBeenCalled();
    expect(rotateLogIfNeeded).toHaveBeenCalledWith("/tmp/events.log", 10, 1);
    loop.stop();
    vi.useRealTimers();
  });

  it("skips tick while previous tick is still running", async () => {
    vi.useFakeTimers();
    let resolveUpdate: () => void = () => {};
    const updatePending = new Promise<void>((resolve) => {
      resolveUpdate = resolve;
    });
    const updateFromPanes = vi.fn(() => updatePending);
    const rotateLogIfNeeded = vi.fn(async () => {});
    const loop = createMonitorLoop(
      {
        intervalMs: 1000,
        eventLogPath: "/tmp/events.log",
        maxEventLogBytes: 10,
        retainRotations: 1,
        updateFromPanes,
      },
      { rotateLogIfNeeded },
    );

    loop.start();
    await vi.advanceTimersByTimeAsync(3000);
    expect(updateFromPanes).toHaveBeenCalledTimes(1);
    expect(rotateLogIfNeeded).toHaveBeenCalledTimes(1);

    resolveUpdate();
    await vi.advanceTimersByTimeAsync(1000);
    expect(updateFromPanes).toHaveBeenCalledTimes(2);
    expect(rotateLogIfNeeded).toHaveBeenCalledTimes(2);

    loop.stop();
    vi.useRealTimers();
  });
});
