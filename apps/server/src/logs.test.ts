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

import { createLogActivityPoller } from "./logs";

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
