import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createStateSaveScheduler } from "./state-save-scheduler";

describe("createStateSaveScheduler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("coalesces schedule calls within the interval into a single save", () => {
    const save = vi.fn();
    const scheduler = createStateSaveScheduler({ save, intervalMs: 1000 });

    scheduler.schedule();
    scheduler.schedule();
    scheduler.schedule();
    expect(save).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1000);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("saves again for changes scheduled after the previous window fired", () => {
    const save = vi.fn();
    const scheduler = createStateSaveScheduler({ save, intervalMs: 1000 });

    scheduler.schedule();
    vi.advanceTimersByTime(1000);
    scheduler.schedule();
    vi.advanceTimersByTime(1000);

    expect(save).toHaveBeenCalledTimes(2);
  });

  it("flush persists pending changes immediately and cancels the timer", () => {
    const save = vi.fn();
    const scheduler = createStateSaveScheduler({ save, intervalMs: 1000 });

    scheduler.schedule();
    scheduler.flush();
    expect(save).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(2000);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("flush without pending changes does nothing", () => {
    const save = vi.fn();
    const scheduler = createStateSaveScheduler({ save, intervalMs: 1000 });

    scheduler.flush();
    expect(save).not.toHaveBeenCalled();
  });

  it("keeps the state dirty and reports the error when save throws", () => {
    const error = new Error("disk full");
    const save = vi.fn(() => {
      if (save.mock.calls.length === 1) {
        throw error;
      }
    });
    const onError = vi.fn();
    const scheduler = createStateSaveScheduler({ save, intervalMs: 1000, onError });

    scheduler.schedule();
    vi.advanceTimersByTime(1000);
    expect(save).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(error);

    // The failed write stays dirty, so the next schedule retries it.
    scheduler.schedule();
    vi.advanceTimersByTime(1000);
    expect(save).toHaveBeenCalledTimes(2);
  });

  it("dispose flushes pending changes and later schedules persist immediately", () => {
    const save = vi.fn();
    const scheduler = createStateSaveScheduler({ save, intervalMs: 1000 });

    scheduler.schedule();
    scheduler.dispose();
    expect(save).toHaveBeenCalledTimes(1);

    scheduler.schedule();
    expect(save).toHaveBeenCalledTimes(2);
  });
});
