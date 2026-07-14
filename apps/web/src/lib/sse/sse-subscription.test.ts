/**
 * sse-subscription tests
 *
 * MSW mocking strategy: `http.get` handlers returning
 *   `new HttpResponse(readableStream, { headers: { "Content-Type": "text/event-stream" } })`
 *
 * Note on timing:
 * - Reconnect tests use real timers; the default BACKOFF_BASE_MS is 1 s, so
 *   reconnect tests have a generous per-test timeout of 10 s.
 * - Heartbeat tests use a short heartbeatTimeoutMs (200 ms) so they complete
 *   in ~1.5 s of real time.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HttpResponse, http, server } from "@/test/msw/server";

import { createSseSubscription } from "./sse-subscription";
import type { SseState, SseSubscription } from "./sse-subscription";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const TEST_URL = "http://test.local/api/streams/sessions";

const enc = new TextEncoder();

const createDeferred = <T>() => {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
};

/** Build an SSE response that immediately enqueues chunks then closes. */
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

/** Build a ReadableStream that never closes until cancelled. */
const neverEndingStream = () =>
  new ReadableStream({
    start() {
      /* intentionally empty – stream stays open until cancel() is called */
    },
    cancel() {
      /* no-op; the stream has no resources to release */
    },
  });

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("createSseSubscription", () => {
  // Keep track of open subscriptions so we can close them in afterEach even
  // if a test fails.
  const openSubs: SseSubscription[] = [];

  beforeEach(() => {
    openSubs.length = 0;
  });

  afterEach(() => {
    for (const sub of openSubs) {
      sub.close();
    }
    openSubs.length = 0;
    vi.unstubAllGlobals();
  });

  // -------------------------------------------------------------------------
  // 1. Basic event reception
  // -------------------------------------------------------------------------

  it("delivers parsed SSE events to onEvent", async () => {
    server.use(
      http.get(TEST_URL, () =>
        sseResponse(['event: sessions\ndata: {"type":"snapshot"}\nid: 1\n\n']),
      ),
    );

    const received: Array<{ event: string; id?: string; data: string }> = [];
    let resolveFirst!: () => void;
    const firstEvent = new Promise<void>((resolve) => {
      resolveFirst = resolve;
    });

    const sub = createSseSubscription({
      url: TEST_URL,
      getHeaders: () => ({ Authorization: "Bearer token" }),
      onEvent: (e) => {
        received.push(e);
        resolveFirst();
      },
    });
    openSubs.push(sub);

    await firstEvent;

    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({
      event: "sessions",
      id: "1",
      data: '{"type":"snapshot"}',
    });
  });

  // -------------------------------------------------------------------------
  // 2. Last-Event-ID is forwarded on reconnect
  // -------------------------------------------------------------------------

  it("sends Last-Event-ID from the received event on reconnect", async () => {
    let requestCount = 0;
    let capturedLastEventId: string | null = null;
    let resolveSecond!: () => void;
    const secondRequest = new Promise<void>((resolve) => {
      resolveSecond = resolve;
    });

    server.use(
      http.get(TEST_URL, ({ request }) => {
        requestCount++;

        if (requestCount === 1) {
          // First request: respond with an event that carries id "99", then close
          return sseResponse(["event: sessions\nid: 99\ndata: snap\n\n"]);
        }

        // Second (reconnect) request: capture the header and hold the stream open
        capturedLastEventId = request.headers.get("Last-Event-ID");
        resolveSecond();
        return new HttpResponse(neverEndingStream(), {
          headers: { "Content-Type": "text/event-stream" },
        });
      }),
    );

    const sub = createSseSubscription({
      url: TEST_URL,
      getHeaders: () => ({}),
      onEvent: () => {},
    });
    openSubs.push(sub);

    await secondRequest;

    expect(capturedLastEventId).toBe("99");
  }, 10_000);

  // -------------------------------------------------------------------------
  // 2b. Initial lastEventId option is forwarded on first connect
  // -------------------------------------------------------------------------

  it("forwards the initial lastEventId option on the first request", async () => {
    let capturedId: string | null = null;
    let resolveFirst!: () => void;
    const firstRequest = new Promise<void>((resolve) => {
      resolveFirst = resolve;
    });

    server.use(
      http.get(TEST_URL, ({ request }) => {
        capturedId = request.headers.get("Last-Event-ID");
        resolveFirst();
        return new HttpResponse(neverEndingStream(), {
          headers: { "Content-Type": "text/event-stream" },
        });
      }),
    );

    const sub = createSseSubscription({
      url: TEST_URL,
      getHeaders: () => ({}),
      lastEventId: "initial-42",
      onEvent: () => {},
    });
    openSubs.push(sub);

    await firstRequest;
    expect(capturedId).toBe("initial-42");
  });

  // -------------------------------------------------------------------------
  // 3. Heartbeat timeout triggers reconnect
  // -------------------------------------------------------------------------

  it("reconnects after heartbeat timeout when no events arrive", async () => {
    let requestCount = 0;
    let resolveSecond!: () => void;
    const secondRequest = new Promise<void>((resolve) => {
      resolveSecond = resolve;
    });

    server.use(
      http.get(TEST_URL, () => {
        requestCount++;
        if (requestCount === 1) {
          // First request: never send data — heartbeat will time out
          return new HttpResponse(neverEndingStream(), {
            headers: { "Content-Type": "text/event-stream" },
          });
        }
        // Second request: notify the test, hold open
        resolveSecond();
        return new HttpResponse(neverEndingStream(), {
          headers: { "Content-Type": "text/event-stream" },
        });
      }),
    );

    const sub = createSseSubscription({
      url: TEST_URL,
      getHeaders: () => ({}),
      onEvent: () => {},
      // Use a short timeout so the test completes quickly with real timers
      heartbeatTimeoutMs: 200,
    });
    openSubs.push(sub);

    // After ~200 ms (heartbeat) + ~1 s (backoff) the second request arrives
    await secondRequest;

    expect(requestCount).toBeGreaterThanOrEqual(2);
  }, 10_000);

  // -------------------------------------------------------------------------
  // 4. close() stops reconnection permanently
  // -------------------------------------------------------------------------

  it("stops reconnecting after close() is called", async () => {
    let requestCount = 0;

    server.use(
      http.get(TEST_URL, () => {
        requestCount++;
        // Always return an immediately-closing stream to trigger reconnect logic
        return sseResponse([]);
      }),
    );

    const states: SseState[] = [];
    const sub = createSseSubscription({
      url: TEST_URL,
      getHeaders: () => ({}),
      onEvent: () => {},
      onStateChange: (s) => {
        states.push(s);
      },
    });

    // Close synchronously — before any reconnect timer fires
    sub.close();

    // Verify the final state is "closed"
    expect(states.at(-1)).toBe("closed");

    // Wait a tick to let any accidental pending microtasks settle
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 50);
    });

    // At most one request can have been made (the initial connect attempt).
    // No further reconnects should occur after close().
    expect(requestCount).toBeLessThanOrEqual(1);
  });

  it("does not publish open or auth callbacks when close wins the fetch race", async () => {
    const response = createDeferred<Response>();
    const fetchMock = vi.fn().mockReturnValue(response.promise);
    vi.stubGlobal("fetch", fetchMock);
    const states: SseState[] = [];
    const onAuthError = vi.fn();
    const onEvent = vi.fn();
    const sub = createSseSubscription({
      url: TEST_URL,
      getHeaders: () => ({}),
      onEvent,
      onStateChange: (state) => states.push(state),
      onAuthError,
    });
    openSubs.push(sub);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());

    sub.close();
    response.resolve(new Response(null, { status: 401 }));
    await Promise.resolve();
    await Promise.resolve();

    expect(states).toEqual(["connecting", "closed"]);
    expect(onAuthError).not.toHaveBeenCalled();
    expect(onEvent).not.toHaveBeenCalled();
  });

  it("does not deliver a chunk whose read resolves after close", async () => {
    const readResult = createDeferred<ReadableStreamReadResult<Uint8Array>>();
    const reader = {
      read: vi.fn().mockReturnValue(readResult.promise),
      cancel: vi.fn().mockResolvedValue(undefined),
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        body: { getReader: () => reader },
      } as unknown as Response),
    );
    const onEvent = vi.fn();
    const states: SseState[] = [];
    const sub = createSseSubscription({
      url: TEST_URL,
      getHeaders: () => ({}),
      onEvent,
      onStateChange: (state) => states.push(state),
    });
    openSubs.push(sub);
    await vi.waitFor(() => expect(states).toContain("open"));

    sub.close();
    readResult.resolve({
      done: false,
      value: enc.encode("event: sessions\ndata: stale\n\n"),
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(onEvent).not.toHaveBeenCalled();
    expect(states.at(-1)).toBe("closed");
  });

  it("stops parser callbacks immediately when an event handler closes the subscription", async () => {
    const reader = {
      read: vi
        .fn()
        .mockResolvedValueOnce({
          done: false,
          value: enc.encode(
            "event: sessions\ndata: first\n\nevent: sessions\ndata: stale-second\n\n",
          ),
        })
        .mockResolvedValue({ done: true, value: undefined }),
      cancel: vi.fn().mockResolvedValue(undefined),
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        body: { getReader: () => reader },
      } as unknown as Response),
    );
    const received: string[] = [];
    let sub!: SseSubscription;
    sub = createSseSubscription({
      url: TEST_URL,
      getHeaders: () => ({}),
      onEvent: (event) => {
        received.push(event.data);
        sub.close();
      },
    });
    openSubs.push(sub);

    await vi.waitFor(() => expect(received).toEqual(["first"]));
    expect(received).toEqual(["first"]);
  });

  // -------------------------------------------------------------------------
  // 5. 401 / 403 calls onAuthError and closes without retrying
  // -------------------------------------------------------------------------

  it("calls onAuthError and closes permanently on 401", async () => {
    server.use(
      http.get(TEST_URL, () => HttpResponse.json({ error: "Unauthorized" }, { status: 401 })),
    );

    let authErrorCalled = false;
    const states: SseState[] = [];
    let resolveAuth!: () => void;
    const authErrorEvent = new Promise<void>((resolve) => {
      resolveAuth = resolve;
    });

    const sub = createSseSubscription({
      url: TEST_URL,
      getHeaders: () => ({}),
      onEvent: () => {},
      onStateChange: (s) => {
        states.push(s);
      },
      onAuthError: () => {
        authErrorCalled = true;
        resolveAuth();
      },
    });
    openSubs.push(sub);

    await authErrorEvent;

    expect(authErrorCalled).toBe(true);
    expect(states.at(-1)).toBe("closed");

    // Wait to ensure no reconnect is attempted
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 200);
    });

    // The subscription remains closed and does not retry
    expect(states.at(-1)).toBe("closed");
    expect(states.filter((s) => s === "reconnecting")).toHaveLength(0);
  });

  it("calls onAuthError and closes permanently on 403", async () => {
    server.use(
      http.get(TEST_URL, () => HttpResponse.json({ error: "Forbidden" }, { status: 403 })),
    );

    let authErrorCalled = false;
    let resolveAuth!: () => void;
    const authErrorEvent = new Promise<void>((resolve) => {
      resolveAuth = resolve;
    });

    const sub = createSseSubscription({
      url: TEST_URL,
      getHeaders: () => ({}),
      onEvent: () => {},
      onAuthError: () => {
        authErrorCalled = true;
        resolveAuth();
      },
    });
    openSubs.push(sub);

    await authErrorEvent;
    expect(authErrorCalled).toBe(true);
  });

  // -------------------------------------------------------------------------
  // 6. External AbortSignal closes the subscription
  // -------------------------------------------------------------------------

  it("closes immediately when the external signal is aborted", async () => {
    let requestCount = 0;
    server.use(
      http.get(TEST_URL, () => {
        requestCount++;
        return new HttpResponse(neverEndingStream(), {
          headers: { "Content-Type": "text/event-stream" },
        });
      }),
    );

    const ac = new AbortController();
    const states: SseState[] = [];
    let resolveOpen!: () => void;
    const openEvent = new Promise<void>((resolve) => {
      resolveOpen = resolve;
    });

    const sub = createSseSubscription({
      url: TEST_URL,
      getHeaders: () => ({}),
      onEvent: () => {},
      onStateChange: (s) => {
        states.push(s);
        if (s === "open") resolveOpen();
      },
      signal: ac.signal,
    });
    openSubs.push(sub);

    await openEvent;

    // Abort the external signal
    ac.abort();

    expect(states.at(-1)).toBe("closed");

    // No further reconnects after a few ms
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 100);
    });

    expect(requestCount).toBe(1);
  });

  it("does not connect at all when signal is already aborted", () => {
    const ac = new AbortController();
    ac.abort();

    const states: SseState[] = [];
    const sub = createSseSubscription({
      url: TEST_URL,
      getHeaders: () => ({}),
      onEvent: () => {},
      onStateChange: (s) => {
        states.push(s);
      },
      signal: ac.signal,
    });
    openSubs.push(sub);

    // No state transitions should occur (no connection was attempted)
    expect(states).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // 7. onStateChange transitions
  // -------------------------------------------------------------------------

  it("transitions through connecting → open → reconnecting on stream close", async () => {
    let requestCount = 0;
    let resolveSecond!: () => void;
    const secondRequestSeen = new Promise<void>((resolve) => {
      resolveSecond = resolve;
    });

    server.use(
      http.get(TEST_URL, () => {
        requestCount++;
        if (requestCount === 1) {
          return sseResponse(["data: hello\n\n"]);
        }
        resolveSecond();
        return new HttpResponse(neverEndingStream(), {
          headers: { "Content-Type": "text/event-stream" },
        });
      }),
    );

    const states: SseState[] = [];
    const sub = createSseSubscription({
      url: TEST_URL,
      getHeaders: () => ({}),
      onEvent: () => {},
      onStateChange: (s) => {
        states.push(s);
      },
    });
    openSubs.push(sub);

    await secondRequestSeen;

    expect(states).toContain("connecting");
    expect(states).toContain("open");
    expect(states).toContain("reconnecting");
  }, 10_000);
});
