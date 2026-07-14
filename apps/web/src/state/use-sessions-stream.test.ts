/**
 * use-sessions-stream tests
 *
 * MSW mocking strategy: mirrors sse-subscription.test.ts.
 * The API base URL is fixed to http://test.local/api so the hook constructs
 * http://test.local/api/streams/sessions.
 */

import type { SessionSummary } from "@vde-monitor/shared";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HttpResponse, http, server } from "@/test/msw/server";

import { useSessionsStream } from "./use-sessions-stream";
import type { SessionsStreamTransport } from "./use-sessions-stream";

// ---------------------------------------------------------------------------
// Test constants
// ---------------------------------------------------------------------------

const API_BASE_URL = "http://test.local/api";
const STREAM_URL = `${API_BASE_URL}/streams/sessions`;
const TOKEN = "test-token";
const enc = new TextEncoder();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal SessionSummary for use in test payloads. */
const makeSession = (paneId: string): SessionSummary => ({
  paneId,
  sessionId: "test-session-id",
  sessionName: "test-session",
  windowId: "test-window-id",
  windowIndex: 0,
  paneIndex: 0,
  paneActive: true,
  currentCommand: null,
  currentPath: null,
  paneTty: null,
  title: null,
  customTitle: null,
  repoRoot: null,
  agent: "unknown",
  state: "RUNNING",
  stateReason: "",
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

/** SSE response whose stream closes immediately after delivering chunks. */
const sseResponse = (chunks: string[]) => {
  const stream = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(enc.encode(chunk));
      }
      controller.close();
    },
  });
  return new HttpResponse(stream, {
    headers: { "Content-Type": "text/event-stream" },
  });
};

/** A stream that stays open forever (until cancelled). */
const neverEndingStream = () =>
  new ReadableStream({
    cancel() {
      /* no-op */
    },
  });

/** SSE response that stays open (simulates a live SSE connection). */
const openSseResponse = (initialChunks: string[] = []) => {
  const stream = new ReadableStream({
    start(controller) {
      for (const chunk of initialChunks) {
        controller.enqueue(enc.encode(chunk));
      }
      // Stream stays open
    },
    cancel() {
      /* no-op */
    },
  });
  return new HttpResponse(stream, {
    headers: { "Content-Type": "text/event-stream" },
  });
};

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("useSessionsStream", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // 1. transport transitions to "sse" when stream opens
  // -------------------------------------------------------------------------

  it('calls onTransportChange("sse") when SSE connection opens', async () => {
    server.use(
      http.get(
        STREAM_URL,
        () =>
          new HttpResponse(neverEndingStream(), {
            headers: { "Content-Type": "text/event-stream" },
          }),
      ),
    );

    const onTransportChange = vi.fn();
    renderHook(() =>
      useSessionsStream({
        enabled: true,
        apiBaseUrl: API_BASE_URL,
        token: TOKEN,
        onSnapshot: vi.fn(),
        onUpsert: vi.fn(),
        onRemove: vi.fn(),
        onTransportChange,
      }),
    );

    await waitFor(() => {
      expect(onTransportChange).toHaveBeenCalledWith("sse");
    });
  });

  // -------------------------------------------------------------------------
  // 2. snapshot event
  // -------------------------------------------------------------------------

  it("calls onSnapshot with sessions from a snapshot event", async () => {
    const session = makeSession("pane-1");
    const payload = JSON.stringify({
      type: "snapshot",
      serverTime: new Date().toISOString(),
      sessions: [session],
    });
    const chunk = `event: sessions\ndata: ${payload}\n\n`;

    server.use(http.get(STREAM_URL, () => openSseResponse([chunk])));

    const onSnapshot = vi.fn();

    renderHook(() =>
      useSessionsStream({
        enabled: true,
        apiBaseUrl: API_BASE_URL,
        token: TOKEN,
        onSnapshot,
        onUpsert: vi.fn(),
        onRemove: vi.fn(),
        onTransportChange: vi.fn(),
      }),
    );

    await waitFor(() => {
      expect(onSnapshot).toHaveBeenCalledOnce();
    });
    expect(onSnapshot.mock.calls[0]?.[0]).toHaveLength(1);
    expect(onSnapshot.mock.calls[0]?.[0]?.[0]?.paneId).toBe("pane-1");
  });

  // -------------------------------------------------------------------------
  // 3. upsert event
  // -------------------------------------------------------------------------

  it("calls onUpsert with session from an upsert event", async () => {
    const session = makeSession("pane-2");
    const payload = JSON.stringify({
      type: "upsert",
      serverTime: new Date().toISOString(),
      session,
    });
    const chunk = `event: sessions\ndata: ${payload}\n\n`;

    server.use(http.get(STREAM_URL, () => openSseResponse([chunk])));

    const onUpsert = vi.fn();

    renderHook(() =>
      useSessionsStream({
        enabled: true,
        apiBaseUrl: API_BASE_URL,
        token: TOKEN,
        onSnapshot: vi.fn(),
        onUpsert,
        onRemove: vi.fn(),
        onTransportChange: vi.fn(),
      }),
    );

    await waitFor(() => {
      expect(onUpsert).toHaveBeenCalledOnce();
    });
    expect(onUpsert.mock.calls[0]?.[0]?.paneId).toBe("pane-2");
  });

  // -------------------------------------------------------------------------
  // 4. remove event
  // -------------------------------------------------------------------------

  it("calls onRemove with paneId from a remove event", async () => {
    const payload = JSON.stringify({
      type: "remove",
      serverTime: new Date().toISOString(),
      paneId: "pane-3",
    });
    const chunk = `event: sessions\ndata: ${payload}\n\n`;

    server.use(http.get(STREAM_URL, () => openSseResponse([chunk])));

    const onRemove = vi.fn();

    renderHook(() =>
      useSessionsStream({
        enabled: true,
        apiBaseUrl: API_BASE_URL,
        token: TOKEN,
        onSnapshot: vi.fn(),
        onUpsert: vi.fn(),
        onRemove,
        onTransportChange: vi.fn(),
      }),
    );

    await waitFor(() => {
      expect(onRemove).toHaveBeenCalledOnce();
    });
    expect(onRemove.mock.calls[0]?.[0]).toBe("pane-3");
  });

  // -------------------------------------------------------------------------
  // 5. Non-sessions events are ignored (e.g. heartbeat)
  // -------------------------------------------------------------------------

  it("ignores heartbeat events and does not call session callbacks", async () => {
    // Send a heartbeat, then keep the stream open
    const heartbeatChunk = `event: heartbeat\ndata: {}\n\n`;

    server.use(http.get(STREAM_URL, () => openSseResponse([heartbeatChunk])));

    const onSnapshot = vi.fn();
    const onUpsert = vi.fn();
    const onRemove = vi.fn();
    const onTransportChange = vi.fn();

    renderHook(() =>
      useSessionsStream({
        enabled: true,
        apiBaseUrl: API_BASE_URL,
        token: TOKEN,
        onSnapshot,
        onUpsert,
        onRemove,
        onTransportChange,
      }),
    );

    // Wait for transport to open
    await waitFor(() => {
      expect(onTransportChange).toHaveBeenCalledWith("sse");
    });

    // Session callbacks should not have been triggered
    expect(onSnapshot).not.toHaveBeenCalled();
    expect(onUpsert).not.toHaveBeenCalled();
    expect(onRemove).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 6. 401 triggers onAuthError and transport stays "polling"
  // -------------------------------------------------------------------------

  it("calls onAuthError and keeps transport as polling on 401", async () => {
    server.use(
      http.get(STREAM_URL, () => HttpResponse.json({ error: "Unauthorized" }, { status: 401 })),
    );

    const onAuthError = vi.fn();
    const onTransportChange = vi.fn();

    renderHook(() =>
      useSessionsStream({
        enabled: true,
        apiBaseUrl: API_BASE_URL,
        token: TOKEN,
        onSnapshot: vi.fn(),
        onUpsert: vi.fn(),
        onRemove: vi.fn(),
        onAuthError,
        onTransportChange,
      }),
    );

    await waitFor(() => {
      expect(onAuthError).toHaveBeenCalledOnce();
    });

    // Transport must never have become "sse"
    const sseCall = onTransportChange.mock.calls.find((c) => c[0] === "sse");
    expect(sseCall).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // 7. disabled hook does not connect
  // -------------------------------------------------------------------------

  it("does not connect when enabled is false", async () => {
    let requestCount = 0;
    server.use(
      http.get(STREAM_URL, () => {
        requestCount++;
        return new HttpResponse(neverEndingStream(), {
          headers: { "Content-Type": "text/event-stream" },
        });
      }),
    );

    renderHook(() =>
      useSessionsStream({
        enabled: false,
        apiBaseUrl: API_BASE_URL,
        token: TOKEN,
        onSnapshot: vi.fn(),
        onUpsert: vi.fn(),
        onRemove: vi.fn(),
        onTransportChange: vi.fn(),
      }),
    );

    // Wait a tick to confirm no connection was made
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
    expect(requestCount).toBe(0);
  });

  // -------------------------------------------------------------------------
  // 8. null token does not connect
  // -------------------------------------------------------------------------

  it("does not connect when token is null", async () => {
    let requestCount = 0;
    server.use(
      http.get(STREAM_URL, () => {
        requestCount++;
        return new HttpResponse(neverEndingStream(), {
          headers: { "Content-Type": "text/event-stream" },
        });
      }),
    );

    renderHook(() =>
      useSessionsStream({
        enabled: true,
        apiBaseUrl: API_BASE_URL,
        token: null,
        onSnapshot: vi.fn(),
        onUpsert: vi.fn(),
        onRemove: vi.fn(),
        onTransportChange: vi.fn(),
      }),
    );

    await new Promise<void>((resolve) => setTimeout(resolve, 50));
    expect(requestCount).toBe(0);
  });

  // -------------------------------------------------------------------------
  // 9. Stream closes and transport reverts to "polling"
  // -------------------------------------------------------------------------

  it('calls onTransportChange("polling") when stream closes', async () => {
    // First connection closes immediately (stream done), triggering reconnect
    server.use(http.get(STREAM_URL, () => sseResponse([])));

    const transports: SessionsStreamTransport[] = [];
    const onTransportChange = vi.fn((t: SessionsStreamTransport) => {
      transports.push(t);
    });

    renderHook(() =>
      useSessionsStream({
        enabled: true,
        apiBaseUrl: API_BASE_URL,
        token: TOKEN,
        onSnapshot: vi.fn(),
        onUpsert: vi.fn(),
        onRemove: vi.fn(),
        onTransportChange,
      }),
    );

    // Wait for at least one "polling" call (stream closed before or after open)
    await waitFor(
      () => {
        expect(transports).toContain("polling");
      },
      { timeout: 5_000 },
    );
  }, 10_000);
});
