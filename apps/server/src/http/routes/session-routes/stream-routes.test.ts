import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";

import type { ScreenResponse } from "@vde-monitor/shared";

import type { ScreenStreamScheduler } from "../../../streams/screen-stream-scheduler";
import type { SessionsStreamSource } from "../../../streams/sessions-stream-source";
import type { StreamConnections } from "../../../streams/stream-connections";
import type { Monitor } from "../types";
import {
  createBoundedSseQueue,
  createStreamRoutes,
  runScreenSseSession,
  runSessionsSseSession,
} from "./stream-routes";

// ---- helpers ---------------------------------------------------------------

const makeSessionSummary = (paneId = "pane-1") => ({
  paneId,
  sessionId: "session",
  sessionName: "session",
  windowId: "window-0",
  windowIndex: 0,
  paneIndex: 0,
  paneActive: true,
  currentCommand: null,
  currentPath: "/tmp",
  paneTty: "tty1",
  title: null,
  customTitle: null,
  repoRoot: null,
  agent: "codex" as const,
  state: "RUNNING" as const,
  stateReason: "reason",
  lastMessage: null,
  lastOutputAt: null,
  lastEventAt: null,
  lastInputAt: null,
  lastRunStartedAt: null,
  manualSortAt: null,
  paneDead: false,
  alternateOn: false,
  pipeAttached: false,
  pipeConflict: false,
  completion: null,
});

const makeScreenResponse = (): ScreenResponse => ({
  ok: true,
  paneId: "pane-1",
  mode: "text",
  capturedAt: "2026-01-01T00:00:00.000Z",
  lines: 100,
  truncated: null,
  alternateOn: false,
  cursor: "cursor-1",
  full: true,
  screen: "hello",
});

const makeSnapshotEntry = () => ({
  id: 5,
  event: {
    type: "snapshot" as const,
    serverTime: "2026-01-01T00:00:00.000Z",
    sessions: [makeSessionSummary()],
  },
});

/**
 * Parse SSE events from a raw text chunk. Returns lines that start with "event:".
 */
const parseSSEEventNames = (text: string): string[] =>
  text
    .split("\n")
    .filter((l) => l.startsWith("event:"))
    .map((l) => l.replace(/^event:\s*/, "").trim());

const readFirstChunk = async (body: ReadableStream<Uint8Array>): Promise<string> => {
  const reader = body.getReader();
  const { value } = await reader.read();
  await reader.cancel();
  return new TextDecoder().decode(value);
};

// ---- test setup ------------------------------------------------------------

type TestDeps = {
  monitor: Monitor;
  streamSource: SessionsStreamSource;
  screenScheduler: ScreenStreamScheduler;
  streamConnections: StreamConnections;
};

const createDeps = (
  detail: ReturnType<typeof makeSessionSummary> | null = makeSessionSummary(),
): TestDeps => {
  const monitor = {
    registry: {
      getDetail: vi.fn(() => detail),
    },
  } as unknown as Monitor;

  const streamSource: SessionsStreamSource = {
    subscribe: vi.fn(() => () => {}),
    snapshot: vi.fn(() => makeSnapshotEntry()),
    replaySince: vi.fn(() => null),
    dispose: vi.fn(),
  };

  const screenScheduler: ScreenStreamScheduler = {
    subscribe: vi.fn((paneId: string, listener: (r: ScreenResponse) => void) => {
      // Simulate immediate delivery.
      setImmediate(() => listener(makeScreenResponse()));
      return () => {};
    }),
    dispose: vi.fn(),
  };

  const streamConnections: StreamConnections = {
    add: vi.fn(() => () => {}),
    closeAll: vi.fn(),
  };

  return { monitor, streamSource, screenScheduler, streamConnections };
};

const createApp = (deps: TestDeps) => {
  const app = new Hono();
  app.route("/", createStreamRoutes(deps));
  return app;
};

describe("createBoundedSseQueue", () => {
  it("coalesces heartbeats and replaces overflowing session events with a snapshot", () => {
    const queue = createBoundedSseQueue({
      maxDataItems: 2,
      onDataOverflow: () => ({ event: "sessions", data: "snapshot" }),
    });

    expect(queue.enqueue({ event: "heartbeat", data: "{}" })).toBe(true);
    expect(queue.enqueue({ event: "heartbeat", data: "{}" })).toBe(true);
    expect(queue.enqueue({ event: "sessions", data: "upsert-1" })).toBe(true);
    expect(queue.enqueue({ event: "sessions", data: "upsert-2" })).toBe(true);
    expect(queue.enqueue({ event: "sessions", data: "upsert-3" })).toBe(true);

    expect(queue.shift()).toEqual({ event: "heartbeat", data: "{}" });
    expect(queue.shift()).toEqual({ event: "sessions", data: "snapshot" });
    expect(queue.hasItems()).toBe(false);
  });

  it("rejects overflow when screen deltas cannot be safely coalesced", () => {
    const queue = createBoundedSseQueue({ maxDataItems: 1 });

    expect(queue.enqueue({ event: "screen", data: "full" })).toBe(true);
    expect(queue.enqueue({ event: "screen", data: "delta" })).toBe(false);
    expect(queue.shift()).toEqual({ event: "screen", data: "full" });
  });
});

describe("runScreenSseSession", () => {
  it("aborts a blocked writer when the screen queue overflows", async () => {
    vi.useFakeTimers();
    let listener: ((response: ScreenResponse) => void) | null = null;
    const unsubscribe = vi.fn();
    const screenScheduler = {
      subscribe: vi.fn((_paneId: string, nextListener: (response: ScreenResponse) => void) => {
        listener = nextListener;
        return unsubscribe;
      }),
      dispose: vi.fn(),
    } as unknown as ScreenStreamScheduler;
    let resolveWrite = (): void => {};
    const blockedWrite = new Promise<void>((resolve) => {
      resolveWrite = resolve;
    });
    const writeSSE = vi.fn(() => blockedWrite);
    let abortListener: (() => void) | null = null;
    const onAbort = vi.fn((listener: () => void) => {
      abortListener = listener;
    });
    const abort = vi.fn(() => {
      abortListener?.();
      resolveWrite();
    });
    const removeConnection = vi.fn();
    const streamConnections = {
      add: vi.fn(() => removeConnection),
      closeAll: vi.fn(),
    } as StreamConnections;
    const running = runScreenSseSession({
      paneId: "pane-1",
      stream: { writeSSE, onAbort, abort },
      screenScheduler,
      streamConnections,
    });
    const emit = listener as ((response: ScreenResponse) => void) | null;
    if (emit == null) throw new Error("screen listener was not registered");

    emit(makeScreenResponse());
    await Promise.resolve();
    expect(writeSSE).toHaveBeenCalledOnce();
    for (let index = 0; index < 9; index += 1) {
      emit({ ...makeScreenResponse(), cursor: `cursor-${index + 2}` });
    }

    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
    expect(abort).toHaveBeenCalledOnce();
    expect(removeConnection).not.toHaveBeenCalled();

    await running;
    expect(removeConnection).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });
});

describe("runSessionsSseSession", () => {
  it("aborts a blocked writer when the connection registry closes the session stream", async () => {
    vi.useFakeTimers();
    const deps = createDeps();
    const unsubscribe = vi.fn();
    vi.mocked(deps.streamSource.subscribe).mockReturnValue(unsubscribe);
    let resolveWrite = (): void => {};
    const blockedWrite = new Promise<void>((resolve) => {
      resolveWrite = resolve;
    });
    const writeSSE = vi.fn(() => blockedWrite);
    let abortListener: (() => void) | null = null;
    const onAbort = vi.fn((listener: () => void) => {
      abortListener = listener;
    });
    const abort = vi.fn(() => {
      abortListener?.();
      resolveWrite();
    });
    let closeConnection = (): void => {};
    const removeConnection = vi.fn();
    const streamConnections = {
      add: vi.fn((close: () => void) => {
        closeConnection = close;
        return removeConnection;
      }),
      closeAll: vi.fn(),
    } as StreamConnections;
    const running = runSessionsSseSession({
      lastEventId: null,
      stream: { writeSSE, onAbort, abort },
      streamSource: deps.streamSource,
      streamConnections,
    });

    await Promise.resolve();
    expect(writeSSE).toHaveBeenCalledOnce();
    closeConnection();

    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
    expect(abort).toHaveBeenCalledOnce();
    expect(removeConnection).not.toHaveBeenCalled();

    await running;
    expect(removeConnection).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });
});

// ---- tests -----------------------------------------------------------------

describe("GET /streams/sessions", () => {
  it("opens a registered SSE subscription with headers and an initial snapshot", async () => {
    const deps = createDeps();
    const response = await createApp(deps).request("/streams/sessions", {
      headers: { Accept: "text/event-stream" },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(response.headers.get("cache-control")).toBe("no-cache, no-transform");
    expect(response.headers.get("x-accel-buffering")).toBe("no");
    if (!response.body) throw new Error("no body");
    const text = await readFirstChunk(response.body);
    expect(parseSSEEventNames(text)).toEqual(["sessions"]);
    expect(deps.streamSource.snapshot).toHaveBeenCalledOnce();
    expect(deps.streamSource.subscribe).toHaveBeenCalledOnce();
    expect(deps.streamConnections.add).toHaveBeenCalledOnce();
  });

  it("attempts replay when Last-Event-ID is provided", async () => {
    vi.useRealTimers();
    const deps = createDeps();
    (deps.streamSource.replaySince as ReturnType<typeof vi.fn>).mockReturnValue([]);
    const app = createApp(deps);

    const response = await app.request("/streams/sessions", {
      headers: { "Last-Event-ID": "3" },
    });
    await response.body?.cancel();

    expect(deps.streamSource.replaySince).toHaveBeenCalledWith(3);
    // snapshot should NOT be called since replay succeeded.
    expect(deps.streamSource.snapshot).not.toHaveBeenCalled();
  });

  it("falls back to snapshot when Last-Event-ID is outside buffer (replay=null)", async () => {
    vi.useRealTimers();
    const deps = createDeps();
    (deps.streamSource.replaySince as ReturnType<typeof vi.fn>).mockReturnValue(null);
    const app = createApp(deps);

    const response = await app.request("/streams/sessions", {
      headers: { "Last-Event-ID": "99" },
    });
    await response.body?.cancel();

    expect(deps.streamSource.snapshot).toHaveBeenCalled();
  });

  it("uses a snapshot instead of queueing an oversized replay", async () => {
    vi.useRealTimers();
    const deps = createDeps();
    (deps.streamSource.replaySince as ReturnType<typeof vi.fn>).mockReturnValue(
      Array.from({ length: 101 }, (_, index) => ({
        id: index + 1,
        event: {
          type: "remove",
          serverTime: "2026-01-01T00:00:00.000Z",
          paneId: `pane-${index}`,
        },
      })),
    );
    const app = createApp(deps);

    const response = await app.request("/streams/sessions", {
      headers: { "Last-Event-ID": "0" },
    });
    await response.body?.cancel();

    expect(deps.streamSource.snapshot).toHaveBeenCalled();
  });
});

describe("GET /streams/sessions/:paneId/screen", () => {
  it("returns 404 when pane is not found", async () => {
    const deps = createDeps(null);
    const app = createApp(deps);

    const response = await app.request("/streams/sessions/missing-pane/screen");
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("INVALID_PANE");
  });

  it("opens a registered pane subscription with SSE headers and screen data", async () => {
    const deps = createDeps();
    const response = await createApp(deps).request("/streams/sessions/pane-1/screen");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(response.headers.get("cache-control")).toBe("no-cache, no-transform");
    expect(response.headers.get("x-accel-buffering")).toBe("no");
    if (!response.body) throw new Error("no body");
    expect(parseSSEEventNames(await readFirstChunk(response.body))).toEqual(["screen"]);
    expect(deps.screenScheduler.subscribe).toHaveBeenCalledWith("pane-1", expect.any(Function));
    expect(deps.streamConnections.add).toHaveBeenCalledOnce();
  });
});
