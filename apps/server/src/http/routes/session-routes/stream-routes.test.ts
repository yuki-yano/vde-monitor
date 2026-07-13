import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ScreenResponse } from "@vde-monitor/shared";

import type { ScreenStreamScheduler } from "../../../streams/screen-stream-scheduler";
import type { SessionsStreamSource } from "../../../streams/sessions-stream-source";
import type { StreamConnections } from "../../../streams/stream-connections";
import type { Monitor } from "../types";
import { createStreamRoutes } from "./stream-routes";

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

// ---- tests -----------------------------------------------------------------

describe("GET /streams/sessions", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 200 with text/event-stream content type", async () => {
    const deps = createDeps();
    const app = createApp(deps);

    const res = app.request("/streams/sessions", {
      headers: { Accept: "text/event-stream" },
    });

    // We need to abort the request after getting the response.
    const response = await res;
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    await response.body?.cancel();
  });

  it("sets Cache-Control: no-cache, no-transform header", async () => {
    const deps = createDeps();
    const app = createApp(deps);

    const response = await app.request("/streams/sessions");
    expect(response.headers.get("cache-control")).toBe("no-cache, no-transform");
    await response.body?.cancel();
  });

  it("sets X-Accel-Buffering: no header", async () => {
    const deps = createDeps();
    const app = createApp(deps);

    const response = await app.request("/streams/sessions");
    expect(response.headers.get("x-accel-buffering")).toBe("no");
    await response.body?.cancel();
  });

  it("sends snapshot as first event when no Last-Event-ID", async () => {
    vi.useRealTimers();
    const deps = createDeps();
    const app = createApp(deps);

    const response = await app.request("/streams/sessions");
    const body = response.body;
    if (!body) throw new Error("no body");

    const text = await readFirstChunk(body);
    const eventNames = parseSSEEventNames(text);

    expect(eventNames).toContain("sessions");
    expect(deps.streamSource.snapshot).toHaveBeenCalled();
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

  it("subscribes to streamSource after initial delivery", async () => {
    vi.useRealTimers();
    const deps = createDeps();
    (deps.streamSource.replaySince as ReturnType<typeof vi.fn>).mockReturnValue([]);
    const app = createApp(deps);

    const response = await app.request("/streams/sessions", {
      headers: { "Last-Event-ID": "0" },
    });
    await response.body?.cancel();

    expect(deps.streamSource.subscribe).toHaveBeenCalled();
  });

  it("registers connection with streamConnections", async () => {
    vi.useRealTimers();
    const deps = createDeps();
    const app = createApp(deps);

    const response = await app.request("/streams/sessions");
    await response.body?.cancel();

    expect(deps.streamConnections.add).toHaveBeenCalled();
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

  it("returns 200 with text/event-stream for valid pane", async () => {
    const deps = createDeps(makeSessionSummary("pane-1"));
    const app = createApp(deps);

    const response = await app.request("/streams/sessions/pane-1/screen");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    await response.body?.cancel();
  });

  it("sets Cache-Control: no-cache, no-transform for screen stream", async () => {
    const deps = createDeps(makeSessionSummary("pane-1"));
    const app = createApp(deps);

    const response = await app.request("/streams/sessions/pane-1/screen");
    expect(response.headers.get("cache-control")).toBe("no-cache, no-transform");
    await response.body?.cancel();
  });

  it("sets X-Accel-Buffering: no for screen stream", async () => {
    const deps = createDeps(makeSessionSummary("pane-1"));
    const app = createApp(deps);

    const response = await app.request("/streams/sessions/pane-1/screen");
    expect(response.headers.get("x-accel-buffering")).toBe("no");
    await response.body?.cancel();
  });

  it("subscribes screenScheduler for the requested paneId", async () => {
    const deps = createDeps(makeSessionSummary("pane-1"));
    const app = createApp(deps);

    const response = await app.request("/streams/sessions/pane-1/screen");
    await response.body?.cancel();

    expect(deps.screenScheduler.subscribe).toHaveBeenCalledWith("pane-1", expect.any(Function));
  });

  it("registers connection with streamConnections", async () => {
    const deps = createDeps(makeSessionSummary("pane-1"));
    const app = createApp(deps);

    const response = await app.request("/streams/sessions/pane-1/screen");
    await response.body?.cancel();

    expect(deps.streamConnections.add).toHaveBeenCalled();
  });
});
