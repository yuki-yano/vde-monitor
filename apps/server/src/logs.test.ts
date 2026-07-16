import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  mkdir: vi.fn(),
  stat: vi.fn(),
  truncate: vi.fn(),
  rename: vi.fn(),
  readdir: vi.fn(),
  unlink: vi.fn(),
  open: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({
  default: {
    mkdir: mocks.mkdir,
    stat: mocks.stat,
    truncate: mocks.truncate,
    rename: mocks.rename,
    readdir: mocks.readdir,
    unlink: mocks.unlink,
    open: mocks.open,
  },
}));

import { createLogActivityPoller, rotateLogIfNeeded } from "./logs";

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("rotateLogIfNeeded", () => {
  it("renames the active log before creating a new file so concurrent appends are retained", async () => {
    const close = vi.fn(async () => undefined);
    mocks.stat.mockResolvedValue({ size: 101 });
    mocks.rename.mockResolvedValue(undefined);
    mocks.open.mockResolvedValue({ close });
    mocks.readdir.mockResolvedValue([]);

    await expect(rotateLogIfNeeded("/tmp/events.jsonl", 100, 5)).resolves.toBe(true);

    expect(mocks.rename).toHaveBeenCalledWith(
      "/tmp/events.jsonl",
      expect.stringMatching(/^\/tmp\/events\.jsonl\.\d+\./),
    );
    expect(mocks.open).toHaveBeenCalledWith("/tmp/events.jsonl", "a", 0o600);
    expect(mocks.truncate).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledOnce();
  });

  it("does not rotate when the size is within the limit", async () => {
    mocks.stat.mockResolvedValue({ size: 100 });

    await expect(rotateLogIfNeeded("/tmp/events.jsonl", 100, 5)).resolves.toBe(false);

    expect(mocks.rename).not.toHaveBeenCalled();
  });

  it("propagates rename failures", async () => {
    mocks.stat.mockResolvedValue({ size: 101 });
    mocks.rename.mockRejectedValue(new Error("rename failed"));

    await expect(rotateLogIfNeeded("/tmp/events.jsonl", 100, 5)).rejects.toThrow("rename failed");
  });
});

describe("createLogActivityPoller", () => {
  it("does not emit activity on first poll for pre-existing log content", async () => {
    mocks.stat.mockResolvedValue({ size: 1024 });
    const onActivity = vi.fn();

    const poller = createLogActivityPoller(1000);
    poller.register("%1", "/tmp/pane-1.log");
    poller.onActivity(onActivity);
    poller.start();

    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);

    expect(onActivity).not.toHaveBeenCalled();
    expect(mocks.stat).toHaveBeenCalledTimes(2);

    poller.stop();
  });

  it("emits activity only when log size grows after baseline", async () => {
    const onActivity = vi.fn();
    mocks.stat
      .mockResolvedValueOnce({ size: 200 })
      .mockResolvedValueOnce({ size: 200 })
      .mockResolvedValueOnce({ size: 250 });

    const poller = createLogActivityPoller(1000);
    poller.register("%1", "/tmp/pane-1.log");
    poller.onActivity(onActivity);
    poller.start();

    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);

    expect(onActivity).toHaveBeenCalledTimes(1);
    expect(onActivity).toHaveBeenCalledWith("%1", expect.any(String));

    poller.stop();
  });

  it("resets its baseline after rotation and detects later current-log growth", async () => {
    const onActivity = vi.fn();
    mocks.stat
      .mockResolvedValueOnce({ size: 2_000_000 })
      .mockResolvedValueOnce({ size: 0 })
      .mockResolvedValueOnce({ size: 100 });

    const poller = createLogActivityPoller(1000);
    poller.register("%1", "/tmp/pane-1.log");
    poller.onActivity(onActivity);
    poller.start();

    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);
    expect(onActivity).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(onActivity).toHaveBeenCalledOnce();

    poller.stop();
  });

  it("stops polling entries after unregister", async () => {
    mocks.stat.mockResolvedValue({ size: 0 });

    const poller = createLogActivityPoller(1000);
    poller.register("%1", "/tmp/pane-1.log");
    poller.register("%2", "/tmp/pane-2.log");
    poller.unregister("%1");
    poller.start();

    await vi.advanceTimersByTimeAsync(1000);

    expect(mocks.stat).toHaveBeenCalledTimes(1);
    expect(mocks.stat).toHaveBeenCalledWith("/tmp/pane-2.log");

    poller.stop();
  });
});
