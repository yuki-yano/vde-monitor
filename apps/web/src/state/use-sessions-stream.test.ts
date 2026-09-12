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

  it("opens the stream and delivers snapshot, upsert, and remove while ignoring heartbeats", async () => {
    const initial = makeSession("pane-1");
    const updated = makeSession("pane-2");
    const events = [
      { type: "snapshot", sessions: [initial] },
      { type: "upsert", session: updated },
      { type: "remove", paneId: "pane-3" },
    ];
    server.use(
      http.get(STREAM_URL, () =>
        openSseResponse([
          "event: heartbeat\ndata: {}\n\n",
          ...events.map(
            (event) =>
              `event: sessions\ndata: ${JSON.stringify({ ...event, serverTime: new Date(0).toISOString() })}\n\n`,
          ),
        ]),
      ),
    );
    const onSnapshot = vi.fn();
    const onUpsert = vi.fn();
    const onRemove = vi.fn();
    const onTransportChange = vi.fn();
    const { unmount } = renderHook(() =>
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
    await waitFor(() => expect(onRemove).toHaveBeenCalledExactlyOnceWith("pane-3"));
    expect(onTransportChange).toHaveBeenCalledWith("sse");
    expect(onSnapshot).toHaveBeenCalledExactlyOnceWith([initial]);
    expect(onUpsert).toHaveBeenCalledExactlyOnceWith(updated);
    unmount();
  });

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
