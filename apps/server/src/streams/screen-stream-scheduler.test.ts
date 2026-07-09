import { type Mock, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ScreenCaptureMeta, ScreenResponse } from "@vde-monitor/shared";
import type { AgentMonitorConfig } from "@vde-monitor/multiplexer";
import { configDefaults } from "@vde-monitor/shared";

import type { createSessionMonitor } from "../monitor";
import type { ScreenCache } from "../screen/screen-cache";
import { createScreenStreamScheduler } from "./screen-stream-scheduler";

type Monitor = ReturnType<typeof createSessionMonitor>;

const makeDetail = (paneId = "pane-1") => ({
  paneId,
  currentCommand: null as string | null,
  startCommand: null as string | null,
  alternateOn: false,
  sessionName: "session",
  windowIndex: 0,
  paneIndex: 0,
  paneActive: true,
  currentPath: "/tmp" as string | null,
  paneTty: "tty1" as string | null,
  title: null as string | null,
  customTitle: null as string | null,
  repoRoot: null as string | null,
  agent: "codex" as const,
  state: "RUNNING" as const,
  stateReason: "reason",
  lastMessage: null as string | null,
  lastOutputAt: null as string | null,
  lastEventAt: null as string | null,
  lastInputAt: null as string | null,
  paneDead: false,
  pipeAttached: false,
  pipeConflict: false,
  panePid: null as number | null,
});

const makeConfig = (): AgentMonitorConfig => ({
  ...configDefaults,
  token: "token",
});

const makeCaptureMeta = (): ScreenCaptureMeta => ({
  backend: "tmux",
  lineModel: "joined-physical",
  joinLinesApplied: true,
  captureMethod: "tmux-capture-pane",
});

const makeScreenResponse = (cursor = "cursor-initial"): ScreenResponse => ({
  ok: true,
  paneId: "pane-1",
  mode: "text",
  capturedAt: "2026-01-01T00:00:00.000Z",
  captureMeta: makeCaptureMeta(),
  lines: 100,
  truncated: null,
  alternateOn: false,
  cursor,
  full: true,
  screen: "hello",
});

/** Flush pending Promise microtasks (works with fake timers). */
const flushMicrotasks = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

describe("createScreenStreamScheduler", () => {
  let captureText: ReturnType<typeof vi.fn>;
  let buildTextResponse: Mock<ScreenCache["buildTextResponse"]>;
  let monitor: Monitor;
  let config: AgentMonitorConfig;

  beforeEach(() => {
    vi.useFakeTimers();

    captureText = vi.fn(async () => ({
      screen: "hello",
      alternateOn: false,
      truncated: null,
    }));
    buildTextResponse = vi.fn<ScreenCache["buildTextResponse"]>(({ cursor }) =>
      makeScreenResponse(cursor ?? "cursor-initial"),
    );
    const detail = makeDetail();
    monitor = {
      registry: { getDetail: vi.fn(() => detail) },
      getScreenCapture: () => ({ captureText }),
    } as unknown as Monitor;
    config = makeConfig();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("subscribe triggers an immediate capture and delivers full response to listener", async () => {
    const scheduler = createScreenStreamScheduler({ monitor, config, buildTextResponse });
    const listener = vi.fn();

    scheduler.subscribe("pane-1", listener);
    await flushMicrotasks();

    expect(captureText).toHaveBeenCalledOnce();
    expect(buildTextResponse).toHaveBeenCalledWith(expect.objectContaining({ cursor: undefined }));
    expect(listener).toHaveBeenCalledOnce();

    scheduler.dispose();
  });

  it("tick sends response only when screen content changes", async () => {
    const scheduler = createScreenStreamScheduler({ monitor, config, buildTextResponse });
    const listener = vi.fn();

    scheduler.subscribe("pane-1", listener);
    await flushMicrotasks();

    // Initial call on subscribe
    expect(listener).toHaveBeenCalledOnce();
    listener.mockClear();

    // Tick 1: same content → no delivery
    await vi.advanceTimersByTimeAsync(1000);
    await flushMicrotasks();
    expect(listener).not.toHaveBeenCalled();

    // Tick 2: different content
    captureText.mockResolvedValueOnce({ screen: "changed", alternateOn: false, truncated: null });
    await vi.advanceTimersByTimeAsync(1000);
    await flushMicrotasks();

    expect(listener).toHaveBeenCalledOnce();

    scheduler.dispose();
  });

  it("fan-out: all subscribers receive the result from a single capture per tick", async () => {
    const scheduler = createScreenStreamScheduler({ monitor, config, buildTextResponse });
    const listener1 = vi.fn();
    const listener2 = vi.fn();

    scheduler.subscribe("pane-1", listener1);
    scheduler.subscribe("pane-1", listener2);
    await flushMicrotasks();

    listener1.mockClear();
    listener2.mockClear();
    captureText.mockClear();
    buildTextResponse.mockClear();

    // Change screen so the tick delivers
    captureText.mockResolvedValueOnce({ screen: "new", alternateOn: false, truncated: null });
    await vi.advanceTimersByTimeAsync(1000);
    await flushMicrotasks();

    // One capture per pane
    expect(captureText).toHaveBeenCalledOnce();
    // buildTextResponse called once per subscriber
    expect(buildTextResponse).toHaveBeenCalledTimes(2);
    expect(listener1).toHaveBeenCalledOnce();
    expect(listener2).toHaveBeenCalledOnce();

    scheduler.dispose();
  });

  it("unsubscribe stops future delivery to that subscriber", async () => {
    const scheduler = createScreenStreamScheduler({ monitor, config, buildTextResponse });
    const listener = vi.fn();

    const unsubscribe = scheduler.subscribe("pane-1", listener);
    await flushMicrotasks();
    listener.mockClear();

    unsubscribe();

    captureText.mockResolvedValueOnce({ screen: "changed", alternateOn: false, truncated: null });
    await vi.advanceTimersByTimeAsync(1000);
    await flushMicrotasks();

    expect(listener).not.toHaveBeenCalled();

    scheduler.dispose();
  });

  it("no captures are scheduled when there are no subscribers", async () => {
    const scheduler = createScreenStreamScheduler({ monitor, config, buildTextResponse });

    await vi.advanceTimersByTimeAsync(3000);
    await flushMicrotasks();

    expect(captureText).not.toHaveBeenCalled();

    scheduler.dispose();
  });

  it("subscriber cursor is updated on each delivery", async () => {
    let callCount = 0;
    buildTextResponse.mockImplementation(() => makeScreenResponse(`cursor-${++callCount}`));

    const scheduler = createScreenStreamScheduler({ monitor, config, buildTextResponse });
    const listener = vi.fn();

    scheduler.subscribe("pane-1", listener);
    await flushMicrotasks();

    // cursor after first delivery should be passed on second delivery
    captureText.mockResolvedValueOnce({ screen: "changed", alternateOn: false, truncated: null });
    await vi.advanceTimersByTimeAsync(1000);
    await flushMicrotasks();

    // buildTextResponse should be called with the cursor returned by the previous call
    expect(buildTextResponse).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ cursor: "cursor-1" }),
    );

    scheduler.dispose();
  });

  it("dispose stops the interval timer", async () => {
    const scheduler = createScreenStreamScheduler({ monitor, config, buildTextResponse });
    const listener = vi.fn();

    scheduler.subscribe("pane-1", listener);
    await flushMicrotasks();
    listener.mockClear();
    captureText.mockClear();

    scheduler.dispose();

    captureText.mockResolvedValue({ screen: "after-dispose", alternateOn: false, truncated: null });
    await vi.advanceTimersByTimeAsync(5000);
    await flushMicrotasks();

    expect(captureText).not.toHaveBeenCalled();
  });

  it("timer stops automatically when the last subscriber unsubscribes", async () => {
    const scheduler = createScreenStreamScheduler({ monitor, config, buildTextResponse });
    const listener = vi.fn();

    const unsubscribe = scheduler.subscribe("pane-1", listener);
    await flushMicrotasks();
    captureText.mockClear();

    unsubscribe();

    captureText.mockResolvedValue({ screen: "after-unsub", alternateOn: false, truncated: null });
    await vi.advanceTimersByTimeAsync(5000);
    await flushMicrotasks();

    expect(captureText).not.toHaveBeenCalled();

    scheduler.dispose();
  });

  it("skips capture for tick when pane detail is not in registry", async () => {
    const mockGetDetail = vi.fn(() => null);
    monitor = {
      registry: { getDetail: mockGetDetail },
      getScreenCapture: () => ({ captureText }),
    } as unknown as Monitor;

    const scheduler = createScreenStreamScheduler({ monitor, config, buildTextResponse });
    const listener = vi.fn();

    scheduler.subscribe("pane-1", listener);
    await flushMicrotasks();

    // Initial capture: no detail → no delivery
    expect(listener).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1000);
    await flushMicrotasks();
    // Tick: still no detail → still no delivery
    expect(listener).not.toHaveBeenCalled();

    scheduler.dispose();
  });
});
