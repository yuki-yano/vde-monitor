import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  mkdir: vi.fn(),
  stat: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
  truncate: vi.fn(),
  readdir: vi.fn(),
  unlink: vi.fn(),
  open: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({
  default: {
    mkdir: mocks.mkdir,
    stat: mocks.stat,
    readFile: mocks.readFile,
    writeFile: mocks.writeFile,
    truncate: mocks.truncate,
    readdir: mocks.readdir,
    unlink: mocks.unlink,
    open: mocks.open,
  },
  mkdir: mocks.mkdir,
  stat: mocks.stat,
  readFile: mocks.readFile,
  writeFile: mocks.writeFile,
  truncate: mocks.truncate,
  readdir: mocks.readdir,
  unlink: mocks.unlink,
  open: mocks.open,
}));

import { createJsonlTailer, createLogActivityPoller } from "./logs";

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
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

describe("createJsonlTailer", () => {
  it("keeps persisted completion generations unchanged when old JSONL content exists", async () => {
    mocks.stat.mockResolvedValue({ size: 128 });
    const restored = { completedSeq: 3, notificationCount: 0 };
    const tailer = createJsonlTailer(1000);
    tailer.onLine(() => {
      restored.completedSeq += 1;
      restored.notificationCount += 1;
    });

    await tailer.start("/tmp/events.jsonl");
    await vi.advanceTimersByTimeAsync(1000);

    expect(restored).toEqual({ completedSeq: 3, notificationCount: 0 });
    expect(mocks.open).not.toHaveBeenCalled();
    tailer.stop();
  });

  it("emits only complete lines appended after start resolves", async () => {
    mocks.stat.mockResolvedValueOnce({ size: 8 }).mockResolvedValueOnce({ size: 12 });
    const read = vi.fn(
      async (buffer: Buffer, _offset: number, length: number, position: number) => {
        expect(length).toBe(4);
        expect(position).toBe(8);
        buffer.write("new\n");
        return { bytesRead: 4, buffer };
      },
    );
    const close = vi.fn();
    mocks.open.mockResolvedValue({ read, close });
    const onLine = vi.fn();
    const tailer = createJsonlTailer(1000);
    tailer.onLine(onLine);

    await tailer.start("/tmp/events.jsonl");
    await vi.advanceTimersByTimeAsync(1000);

    expect(onLine).toHaveBeenCalledOnce();
    expect(onLine).toHaveBeenCalledWith("new");
    expect(close).toHaveBeenCalledOnce();
    tailer.stop();
  });

  it("rejects start without scheduling a poll when the baseline stat fails", async () => {
    mocks.stat.mockRejectedValueOnce(new Error("stat failed"));
    const tailer = createJsonlTailer(1000);

    await expect(tailer.start("/tmp/events.jsonl")).rejects.toThrow("stat failed");
    await vi.advanceTimersByTimeAsync(1000);

    expect(mocks.stat).toHaveBeenCalledOnce();
    expect(mocks.open).not.toHaveBeenCalled();
    tailer.stop();
  });

  it("does not finish a two-tailer startup before both baselines are known", async () => {
    let resolveFirst = (_value: { size: number }) => {};
    let resolveSecond = (_value: { size: number }) => {};
    mocks.stat
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveFirst = resolve;
        }),
      )
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveSecond = resolve;
        }),
      );
    const first = createJsonlTailer(1000);
    const second = createJsonlTailer(1000);
    let started = false;
    const starting = Promise.all([
      first.start("/tmp/claude.jsonl"),
      second.start("/tmp/codex.jsonl"),
    ]).then(() => {
      started = true;
    });

    await Promise.resolve();
    expect(started).toBe(false);

    resolveFirst({ size: 0 });
    await Promise.resolve();
    expect(started).toBe(false);

    resolveSecond({ size: 0 });
    await starting;
    expect(started).toBe(true);
    first.stop();
    second.stop();
  });
});
