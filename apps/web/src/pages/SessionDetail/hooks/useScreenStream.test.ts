import { act, renderHook, waitFor } from "@testing-library/react";
import type { ScreenResponse } from "@vde-monitor/shared";
import { afterEach, describe, expect, it, vi } from "vitest";

import { HttpResponse, http, server } from "@/test/msw/server";

import { useScreenStream } from "./useScreenStream";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const enc = new TextEncoder();

const openSseResponse = (chunks: string[]) =>
  new HttpResponse(
    new ReadableStream({
      start(controller) {
        chunks.forEach((chunk) => controller.enqueue(enc.encode(chunk)));
      },
      cancel() {},
    }),
    { headers: { "Content-Type": "text/event-stream" } },
  );

const SCREEN_URL = "/api/streams/sessions/pane-1/screen";
const ENCODED_URL = "/api/streams/sessions/pane%20x/screen";

const buildScreenEvent = (payload: Partial<ScreenResponse> = {}): string => {
  const data: ScreenResponse = {
    ok: true,
    paneId: "pane-1",
    mode: "text",
    capturedAt: new Date(0).toISOString(),
    screen: "hello",
    full: true,
    ...payload,
  };
  return `event: screen\ndata: ${JSON.stringify(data)}\n\n`;
};

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("useScreenStream", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("transport is 'polling' when disabled", () => {
    const { result } = renderHook(() =>
      useScreenStream({
        enabled: false,
        paneId: "pane-1",
        apiBasePath: "/api",
        token: "tok",
        onScreenEvent: vi.fn(),
      }),
    );
    expect(result.current.transport).toBe("polling");
  });

  it("transport is 'polling' when token is null", () => {
    const { result } = renderHook(() =>
      useScreenStream({
        enabled: true,
        paneId: "pane-1",
        apiBasePath: "/api",
        token: null,
        onScreenEvent: vi.fn(),
      }),
    );
    expect(result.current.transport).toBe("polling");
  });

  it("connects with an encoded pane and auth, then delivers the first screen", async () => {
    let releaseConnection!: () => void;
    const connectionGate = new Promise<void>((resolve) => {
      releaseConnection = resolve;
    });
    const onScreenEvent = vi.fn();
    let capturedUrl: string | undefined;
    let capturedAuth: string | null = null;
    server.use(
      http.get(ENCODED_URL, async ({ request }) => {
        capturedUrl = request.url;
        capturedAuth = request.headers.get("Authorization");
        await connectionGate;
        return openSseResponse([buildScreenEvent({ paneId: "pane x", screen: "world" })]);
      }),
    );
    const { result, unmount } = renderHook(() =>
      useScreenStream({
        enabled: true,
        paneId: "pane x",
        apiBasePath: "/api",
        token: "my-token",
        onScreenEvent,
      }),
    );
    expect(result.current.transport).toBe("connecting");
    await waitFor(() => expect(capturedUrl).toContain("pane%20x"));
    expect(capturedAuth).toBe("Bearer my-token");
    expect(onScreenEvent).not.toHaveBeenCalled();
    releaseConnection();
    await waitFor(() => expect(result.current.transport).toBe("sse"));
    expect(onScreenEvent).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ paneId: "pane x", screen: "world" }),
    );
    unmount();
  });

  it("falls back to polling when the first screen event misses its deadline", async () => {
    let releaseConnection!: () => void;
    const connectionGate = new Promise<void>((resolve) => {
      releaseConnection = resolve;
    });
    server.use(
      http.get(SCREEN_URL, async () => {
        await connectionGate;
        return openSseResponse([buildScreenEvent()]);
      }),
    );

    const { result, unmount } = renderHook(() =>
      useScreenStream({
        enabled: true,
        paneId: "pane-1",
        apiBasePath: "/api",
        token: "tok",
        onScreenEvent: vi.fn(),
        fallbackDelayMs: 20,
      }),
    );

    expect(result.current.transport).toBe("connecting");
    await waitFor(() => {
      expect(result.current.transport).toBe("polling");
    });

    releaseConnection();
    await waitFor(() => {
      expect(result.current.transport).toBe("sse");
    });
    unmount();
  });

  it("uses the latest event callback without recreating the stream", async () => {
    let streamController: ReadableStreamDefaultController<Uint8Array> | null = null;
    let requestCount = 0;
    server.use(
      http.get(SCREEN_URL, () => {
        requestCount++;
        return new HttpResponse(
          new ReadableStream({
            start(controller) {
              streamController = controller;
            },
            cancel() {},
          }),
          { headers: { "Content-Type": "text/event-stream" } },
        );
      }),
    );
    const firstCallback = vi.fn();
    const latestCallback = vi.fn();

    const { rerender, unmount } = renderHook(
      ({ onScreenEvent }) =>
        useScreenStream({
          enabled: true,
          paneId: "pane-1",
          apiBasePath: "/api",
          token: "tok",
          onScreenEvent,
        }),
      { initialProps: { onScreenEvent: firstCallback } },
    );

    await waitFor(() => {
      expect(streamController).not.toBeNull();
    });
    rerender({ onScreenEvent: latestCallback });
    await act(async () => {
      streamController?.enqueue(enc.encode(buildScreenEvent({ screen: "latest" })));
    });

    await waitFor(() => {
      expect(latestCallback).toHaveBeenCalledOnce();
    });
    expect(firstCallback).not.toHaveBeenCalled();
    expect(latestCallback.mock.calls[0]?.[0].screen).toBe("latest");
    expect(requestCount).toBe(1);

    unmount();
  });

  it("ignores non-screen events", async () => {
    const onScreenEvent = vi.fn();
    let resolveOpen!: () => void;
    const openPromise = new Promise<void>((resolve) => {
      resolveOpen = resolve;
    });

    server.use(
      http.get(SCREEN_URL, () => {
        const stream = new ReadableStream({
          start(controller) {
            // Emit a heartbeat event (not screen), then keep open
            controller.enqueue(enc.encode("event: heartbeat\ndata: {}\n\n"));
            // Don't close — let it be open so we can observe transport=sse
            resolveOpen();
          },
          cancel() {},
        });
        return new HttpResponse(stream, {
          headers: { "Content-Type": "text/event-stream" },
        });
      }),
    );

    renderHook(() =>
      useScreenStream({
        enabled: true,
        paneId: "pane-1",
        apiBasePath: "/api",
        token: "tok",
        onScreenEvent,
      }),
    );

    await openPromise;
    // Give a tick for the heartbeat to be processed
    await new Promise<void>((resolve) => setTimeout(resolve, 50));

    expect(onScreenEvent).not.toHaveBeenCalled();
  });

  it("closes the SSE connection on unmount (no further requests)", async () => {
    let requestCount = 0;

    server.use(
      http.get(SCREEN_URL, () => {
        requestCount++;
        return openSseResponse([buildScreenEvent()]);
      }),
    );

    const { result, unmount } = renderHook(() =>
      useScreenStream({
        enabled: true,
        paneId: "pane-1",
        apiBasePath: "/api",
        token: "tok",
        onScreenEvent: vi.fn(),
      }),
    );

    await waitFor(() => {
      expect(result.current.transport).toBe("sse");
    });

    expect(requestCount).toBe(1);

    // Unmount closes the subscription; no reconnect should fire after this.
    unmount();

    // Give time for any accidental reconnect timer to fire
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 200);
    });

    // No new connection attempts should have been made
    expect(requestCount).toBe(1);
  });

  it("reconnects when paneId changes", async () => {
    const requestedUrls: string[] = [];

    server.use(
      http.get("/api/streams/sessions/:paneId/screen", ({ request }) => {
        requestedUrls.push(new URL(request.url).pathname);
        return openSseResponse([buildScreenEvent()]);
      }),
    );

    let paneId = "pane-1";
    const { result, rerender, unmount } = renderHook(() =>
      useScreenStream({
        enabled: true,
        paneId,
        apiBasePath: "/api",
        token: "tok",
        onScreenEvent: vi.fn(),
      }),
    );

    await waitFor(() => {
      expect(result.current.transport).toBe("sse");
    });

    paneId = "pane-2";
    rerender();
    expect(result.current.transport).toBe("connecting");

    await waitFor(() => {
      expect(requestedUrls).toContain("/api/streams/sessions/pane-2/screen");
    });

    unmount();
  });
});
