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

  it("reports the final flush result from flush and dispose", () => {
    const failing = vi.fn(() => {
      throw new Error("disk full");
    });
    const failingScheduler = createStateSaveScheduler({
      save: failing,
      intervalMs: 1000,
      onError: () => undefined,
    });
    expect(failingScheduler.flush()).toBe(true);
    failingScheduler.schedule();
    expect(failingScheduler.flush()).toBe(false);
    failingScheduler.schedule();
    expect(failingScheduler.dispose()).toBe(false);

    const save = vi.fn();
    const scheduler = createStateSaveScheduler({ save, intervalMs: 1000 });
    scheduler.schedule();
    expect(scheduler.dispose()).toBe(true);
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

  it("retries a late save once when it fails after dispose", () => {
    const save = vi.fn(() => {
      if (save.mock.calls.length === 1) {
        throw new Error("transient failure");
      }
    });
    const onError = vi.fn();
    const onFinalFailure = vi.fn();
    const scheduler = createStateSaveScheduler({
      save,
      intervalMs: 1000,
      onError,
      onFinalFailure,
    });

    expect(scheduler.dispose()).toBe(true);
    scheduler.schedule();

    expect(save).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenCalledOnce();
    expect(onFinalFailure).not.toHaveBeenCalled();
    expect(scheduler.flush()).toBe(true);
    expect(save).toHaveBeenCalledTimes(2);
  });

  it("reports a final failure when a late save and its retry both fail", () => {
    const save = vi.fn(() => {
      throw new Error("disk full");
    });
    const onError = vi.fn();
    const onFinalFailure = vi.fn();
    const scheduler = createStateSaveScheduler({
      save,
      intervalMs: 1000,
      onError,
      onFinalFailure,
    });

    expect(scheduler.dispose()).toBe(true);
    scheduler.schedule();

    expect(save).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenCalledTimes(2);
    expect(onFinalFailure).toHaveBeenCalledOnce();
  });
});
