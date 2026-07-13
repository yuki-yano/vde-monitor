import { act, renderHook, waitFor } from "@testing-library/react";
import type { ScreenResponse } from "@vde-monitor/shared";
import { Provider as JotaiProvider, createStore } from "jotai";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ScreenMode } from "@/lib/screen-loading";
import { HttpResponse, http, server } from "@/test/msw/server";

import { screenErrorAtom, screenFallbackReasonAtom } from "../atoms/screenAtoms";
import { DISCONNECTED_MESSAGE } from "../sessionDetailUtils";
import { useScreenFetch } from "./useScreenFetch";

describe("useScreenFetch", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const setup = (overrides?: Partial<Parameters<typeof useScreenFetch>[0]>) => {
    const requestScreen = vi.fn().mockResolvedValue({
      ok: true,
      paneId: "pane-1",
      mode: "text",
      capturedAt: new Date(0).toISOString(),
      screen: "hello",
    });

    const params = {
      paneId: "pane-1",
      connected: true,
      connectionIssue: null,
      requestScreen,
      mode: "text" as const,
      isUserScrollingRef: { current: false },
      modeLoadedRef: { current: { text: false, image: false } },
      modeSwitchRef: { current: null as "text" | "image" | null },
      screenRef: { current: "" },
      imageRef: { current: null as string | null },
      cursorRef: { current: null as string | null },
      screenLinesRef: { current: [] as string[] },
      pendingScreenRef: { current: null as string | null },
      setScreen: vi.fn(),
      setImageBase64: vi.fn(),
      dispatchScreenLoading: vi.fn(),
      onModeLoaded: vi.fn(),
      ...overrides,
    };

    const store = createStore();
    store.set(screenErrorAtom, null);
    store.set(screenFallbackReasonAtom, null);
    const wrapper = ({ children }: { children: ReactNode }) => (
      <JotaiProvider store={store}>{children}</JotaiProvider>
    );
    const hook = renderHook(() => useScreenFetch(params), { wrapper });
    return { ...hook, params, requestScreen };
  };

  it("requests screen with cursor and marks mode loaded", async () => {
    const { result, params, requestScreen } = setup({
      cursorRef: { current: "cursor-1" },
    });

    await waitFor(() => {
      expect(requestScreen).toHaveBeenCalledWith("pane-1", { mode: "text", cursor: "cursor-1" });
    });

    await waitFor(() => {
      expect(result.current.error).toBeNull();
      expect(params.onModeLoaded).toHaveBeenCalledWith("text");
    });
  });

  it("starts loading when mode is loaded but current text is empty", async () => {
    const dispatchScreenLoading = vi.fn();
    const requestScreen = vi.fn(() => new Promise<ScreenResponse>(() => {}));

    setup({
      requestScreen,
      modeLoadedRef: { current: { text: true, image: true } },
      screenRef: { current: "" },
      dispatchScreenLoading,
    });

    await waitFor(() => {
      expect(requestScreen).toHaveBeenCalledTimes(1);
    });

    expect(dispatchScreenLoading).toHaveBeenCalledWith({ type: "start", mode: "text" });
  });

  it("does not start loading when mode is loaded and current text exists", async () => {
    const dispatchScreenLoading = vi.fn();
    const requestScreen = vi.fn(() => new Promise<ScreenResponse>(() => {}));

    setup({
      requestScreen,
      modeLoadedRef: { current: { text: true, image: true } },
      screenRef: { current: "existing-screen" },
      dispatchScreenLoading,
    });

    await waitFor(() => {
      expect(requestScreen).toHaveBeenCalledTimes(1);
    });

    expect(dispatchScreenLoading).not.toHaveBeenCalledWith({ type: "start", mode: "text" });
  });

  it("ignores stale responses when mode changes mid-flight", async () => {
    let resolveFirst: ((value: ScreenResponse) => void) | undefined;
    let resolveSecond: ((value: ScreenResponse) => void) | undefined;

    const firstPromise = new Promise((resolve) => {
      resolveFirst = resolve;
    });
    const secondPromise = new Promise((resolve) => {
      resolveSecond = resolve;
    });

    const requestScreen = vi
      .fn()
      .mockReturnValueOnce(firstPromise)
      .mockReturnValueOnce(secondPromise);

    const setScreen = vi.fn();
    const setImageBase64 = vi.fn();

    const { result, rerender } = renderHook(
      (mode: ScreenMode) =>
        useScreenFetch({
          paneId: "pane-1",
          connected: true,
          connectionIssue: null,
          requestScreen,
          mode,
          isUserScrollingRef: { current: false },
          modeLoadedRef: { current: { text: false, image: false } },
          modeSwitchRef: { current: null },
          screenRef: { current: "" },
          imageRef: { current: null },
          cursorRef: { current: null },
          screenLinesRef: { current: [] },
          pendingScreenRef: { current: null },
          setScreen,
          setImageBase64,
          dispatchScreenLoading: vi.fn(),
          onModeLoaded: vi.fn(),
        }),
      { initialProps: "text" as ScreenMode },
    );

    await waitFor(() => {
      expect(requestScreen).toHaveBeenCalledTimes(1);
    });

    rerender("image" as ScreenMode);

    await waitFor(() => {
      expect(requestScreen).toHaveBeenCalledTimes(2);
    });

    await act(async () => {
      resolveSecond?.({
        ok: true,
        paneId: "pane-1",
        mode: "image",
        capturedAt: new Date(0).toISOString(),
        imageBase64: "abc",
      });
    });

    await act(async () => {
      resolveFirst?.({
        ok: true,
        paneId: "pane-1",
        mode: "text",
        capturedAt: new Date(0).toISOString(),
        screen: "first",
      });
    });

    expect(setImageBase64).toHaveBeenCalledWith("abc");
    expect(setScreen).not.toHaveBeenCalledWith("first");
    expect(result.current.error).toBeNull();
  });

  it("starts the new pane request and rejects the old pane REST response", async () => {
    let resolvePaneOne!: (value: ScreenResponse) => void;
    let resolvePaneTwo!: (value: ScreenResponse) => void;
    const requestScreen = vi
      .fn()
      .mockReturnValueOnce(
        new Promise<ScreenResponse>((resolve) => {
          resolvePaneOne = resolve;
        }),
      )
      .mockReturnValueOnce(
        new Promise<ScreenResponse>((resolve) => {
          resolvePaneTwo = resolve;
        }),
      );
    const setScreen = vi.fn();
    const screenRef = { current: "" };
    const sharedParams = {
      connected: true,
      connectionIssue: null,
      requestScreen,
      mode: "text" as const,
      isUserScrollingRef: { current: false },
      modeLoadedRef: { current: { text: false, image: false } },
      modeSwitchRef: { current: null },
      screenRef,
      imageRef: { current: null },
      cursorRef: { current: null },
      screenLinesRef: { current: [] as string[] },
      pendingScreenRef: { current: null as string | null },
      setScreen,
      setImageBase64: vi.fn(),
      dispatchScreenLoading: vi.fn(),
      onModeLoaded: vi.fn(),
    };
    const { rerender } = renderHook(
      (paneId: string) => useScreenFetch({ ...sharedParams, paneId }),
      { initialProps: "pane-1" },
    );

    await waitFor(() => {
      expect(requestScreen).toHaveBeenCalledWith("pane-1", { mode: "text" });
    });
    rerender("pane-2");
    await waitFor(() => {
      expect(requestScreen).toHaveBeenCalledWith("pane-2", { mode: "text" });
    });

    await act(async () => {
      resolvePaneOne({
        ok: true,
        paneId: "pane-1",
        mode: "text",
        capturedAt: new Date(2_000).toISOString(),
        screen: "old-pane",
      });
    });
    expect(setScreen).not.toHaveBeenCalledWith("old-pane");

    await act(async () => {
      resolvePaneTwo({
        ok: true,
        paneId: "pane-2",
        mode: "text",
        capturedAt: new Date(1_000).toISOString(),
        screen: "new-pane",
      });
    });
    expect(screenRef.current).toBe("new-pane");
    expect(setScreen).toHaveBeenCalledWith("new-pane");
  });

  it("skips polling while document is hidden", async () => {
    vi.useFakeTimers();
    Object.defineProperty(document, "hidden", { value: true, configurable: true });

    const { result, requestScreen } = setup();

    await act(async () => {});

    expect(requestScreen).toHaveBeenCalledTimes(1);
    expect(result.current.pollingPauseReason).toBe("hidden");

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(requestScreen).toHaveBeenCalledTimes(1);

    Object.defineProperty(document, "hidden", { value: false, configurable: true });

    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
      window.dispatchEvent(new Event("visibilitychange"));
      vi.advanceTimersByTime(1000);
    });

    expect(requestScreen).toHaveBeenCalledTimes(2);
    expect(result.current.pollingPauseReason).toBeNull();
  });

  it("resets loading and sets disconnected error when disconnected without issue", async () => {
    const { result, params, requestScreen } = setup({
      connected: false,
      connectionIssue: null,
    });

    await waitFor(() => {
      expect(params.dispatchScreenLoading).toHaveBeenCalledWith({ type: "reset" });
      expect(result.current.error).toBe(DISCONNECTED_MESSAGE);
    });

    expect(requestScreen).not.toHaveBeenCalled();
    expect(result.current.pollingPauseReason).toBe("disconnected");
  });

  it("defers text render while user is scrolling, even at the bottom", async () => {
    const pendingScreenRef = { current: null as string | null };
    const setScreen = vi.fn();
    const setImageBase64 = vi.fn();

    const { params } = setup({
      isUserScrollingRef: { current: true },
      pendingScreenRef,
      setScreen,
      setImageBase64,
    });

    await waitFor(() => {
      expect(params.onModeLoaded).toHaveBeenCalledWith("text");
    });

    expect(pendingScreenRef.current).toBe("hello");
    expect(setScreen).not.toHaveBeenCalledWith("hello");
    expect(setImageBase64).not.toHaveBeenCalledWith(null);
  });

  // ---------------------------------------------------------------------------
  // SSE integration
  // ---------------------------------------------------------------------------

  it("suspends REST polling while SSE is open", async () => {
    const neverEndingStream = () =>
      new ReadableStream({
        start() {},
        cancel() {},
      });

    server.use(
      http.get(
        "/api/streams/sessions/pane-1/screen",
        () =>
          new HttpResponse(neverEndingStream(), {
            headers: { "Content-Type": "text/event-stream" },
          }),
      ),
    );

    const requestScreen = vi.fn().mockResolvedValue({
      ok: true,
      paneId: "pane-1",
      mode: "text",
      capturedAt: new Date(0).toISOString(),
      screen: "initial",
    });

    const store = createStore();
    store.set(screenErrorAtom, null);
    store.set(screenFallbackReasonAtom, null);
    const wrapper = ({ children }: { children: ReactNode }) => (
      <JotaiProvider store={store}>{children}</JotaiProvider>
    );

    const params = {
      paneId: "pane-1",
      connected: true,
      connectionIssue: null,
      requestScreen,
      mode: "text" as const,
      isUserScrollingRef: { current: false },
      modeLoadedRef: { current: { text: false, image: false } },
      modeSwitchRef: { current: null as "text" | "image" | null },
      screenRef: { current: "" },
      imageRef: { current: null as string | null },
      cursorRef: { current: null as string | null },
      screenLinesRef: { current: [] as string[] },
      pendingScreenRef: { current: null as string | null },
      setScreen: vi.fn(),
      setImageBase64: vi.fn(),
      dispatchScreenLoading: vi.fn(),
      onModeLoaded: vi.fn(),
      apiBasePath: "/api",
      token: "test-token",
    };

    const { result } = renderHook(() => useScreenFetch(params), { wrapper });

    // Wait for the initial REST fetch to complete
    await waitFor(() => {
      expect(requestScreen).toHaveBeenCalledTimes(1);
    });

    // Wait for SSE to open (transport === "sse")
    await waitFor(() => {
      expect(result.current.transport).toBe("sse");
    });

    const callsAfterSseOpen = requestScreen.mock.calls.length;

    // Wait well below the polling interval (1000ms) — polling is suspended so
    // no additional REST calls should fire.
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 200);
    });

    // REST polling should not have fired additional calls while SSE is open
    expect(requestScreen.mock.calls.length).toBe(callsAfterSseOpen);
  });

  it("updates screen via SSE event without REST polling", async () => {
    const enc = new TextEncoder();
    const screenPayload: ScreenResponse = {
      ok: true,
      paneId: "pane-1",
      mode: "text",
      capturedAt: new Date(0).toISOString(),
      screen: "from-sse",
      full: true,
    };

    let resolveFirstEvent!: () => void;
    const firstEventDelivered = new Promise<void>((resolve) => {
      resolveFirstEvent = resolve;
    });

    server.use(
      http.get("/api/streams/sessions/pane-1/screen", () => {
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(
              enc.encode(`event: screen\ndata: ${JSON.stringify(screenPayload)}\n\n`),
            );
          },
          cancel() {},
        });
        return new HttpResponse(stream, {
          headers: { "Content-Type": "text/event-stream" },
        });
      }),
    );

    // requestScreen never resolves so we can isolate the SSE path
    const requestScreen = vi.fn(() => new Promise<ScreenResponse>(() => {}));
    const setScreen = vi.fn().mockImplementation(() => {
      resolveFirstEvent();
    });

    const store = createStore();
    store.set(screenErrorAtom, null);
    store.set(screenFallbackReasonAtom, null);
    const wrapper = ({ children }: { children: ReactNode }) => (
      <JotaiProvider store={store}>{children}</JotaiProvider>
    );

    renderHook(
      () =>
        useScreenFetch({
          paneId: "pane-1",
          connected: true,
          connectionIssue: null,
          requestScreen,
          mode: "text",
          isUserScrollingRef: { current: false },
          modeLoadedRef: { current: { text: false, image: false } },
          modeSwitchRef: { current: null },
          screenRef: { current: "" },
          imageRef: { current: null },
          cursorRef: { current: null },
          screenLinesRef: { current: [] },
          pendingScreenRef: { current: null },
          setScreen,
          setImageBase64: vi.fn(),
          dispatchScreenLoading: vi.fn(),
          onModeLoaded: vi.fn(),
          apiBasePath: "/api",
          token: "test-token",
        }),
      { wrapper },
    );

    await firstEventDelivered;

    expect(setScreen).toHaveBeenCalledWith("from-sse");
  });

  it("does not let an older REST response overwrite a newer SSE screen", async () => {
    const enc = new TextEncoder();
    const sseResponse: ScreenResponse = {
      ok: true,
      paneId: "pane-1",
      mode: "text",
      capturedAt: new Date(2_000).toISOString(),
      screen: "newer-sse",
      full: true,
    };

    server.use(
      http.get("/api/streams/sessions/pane-1/screen", () => {
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(
              enc.encode(`event: screen\ndata: ${JSON.stringify(sseResponse)}\n\n`),
            );
          },
          cancel() {},
        });
        return new HttpResponse(stream, {
          headers: { "Content-Type": "text/event-stream" },
        });
      }),
    );

    let resolveRest!: (response: ScreenResponse) => void;
    const requestScreen = vi.fn(
      () =>
        new Promise<ScreenResponse>((resolve) => {
          resolveRest = resolve;
        }),
    );
    const screenRef = { current: "" };
    const setScreen = vi.fn();
    const { params } = setup({
      requestScreen,
      screenRef,
      setScreen,
      apiBasePath: "/api",
      token: "test-token",
    });

    await waitFor(() => {
      expect(setScreen).toHaveBeenCalledWith("newer-sse");
    });

    await act(async () => {
      resolveRest({
        ok: true,
        paneId: "pane-1",
        mode: "text",
        capturedAt: new Date(1_000).toISOString(),
        screen: "older-rest",
        full: true,
      });
    });

    expect(screenRef.current).toBe("newer-sse");
    expect(setScreen).not.toHaveBeenCalledWith("older-rest");
    expect(params.onModeLoaded).toHaveBeenCalledTimes(1);
  });

  it("rejects a newer REST delta when SSE changed its cursor base", async () => {
    const enc = new TextEncoder();
    const sseResponse: ScreenResponse = {
      ok: true,
      paneId: "pane-1",
      mode: "text",
      capturedAt: new Date(1_000).toISOString(),
      cursor: "sse-cursor",
      screen: "sse-a\nsse-b",
      full: true,
    };
    server.use(
      http.get("/api/streams/sessions/pane-1/screen", () => {
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(
              enc.encode(`event: screen\ndata: ${JSON.stringify(sseResponse)}\n\n`),
            );
          },
          cancel() {},
        });
        return new HttpResponse(stream, {
          headers: { "Content-Type": "text/event-stream" },
        });
      }),
    );

    let resolveRest!: (response: ScreenResponse) => void;
    const requestScreen = vi.fn(
      () =>
        new Promise<ScreenResponse>((resolve) => {
          resolveRest = resolve;
        }),
    );
    const cursorRef = { current: "rest-base" as string | null };
    const screenRef = { current: "rest-a\nrest-b" };
    const screenLinesRef = { current: ["rest-a", "rest-b"] };
    const setScreen = vi.fn();
    setup({
      requestScreen,
      cursorRef,
      screenRef,
      screenLinesRef,
      setScreen,
      apiBasePath: "/api",
      token: "test-token",
    });

    await waitFor(() => {
      expect(setScreen).toHaveBeenCalledWith("sse-a\nsse-b");
    });
    expect(cursorRef.current).toBe("sse-cursor");

    await act(async () => {
      resolveRest({
        ok: true,
        paneId: "pane-1",
        mode: "text",
        capturedAt: new Date(1_000).toISOString(),
        cursor: "rest-next",
        full: false,
        deltas: [{ start: 0, deleteCount: 1, insertLines: ["corrupt"] }],
      });
    });

    expect(screenRef.current).toBe("sse-a\nsse-b");
    expect(screenLinesRef.current).toEqual(["sse-a", "sse-b"]);
    expect(setScreen).not.toHaveBeenCalledWith("corrupt\nsse-b");
    expect(cursorRef.current).toBe("sse-cursor");
  });

  it("ignores SSE screen events for another pane", async () => {
    const enc = new TextEncoder();
    const wrongPaneResponse: ScreenResponse = {
      ok: true,
      paneId: "pane-2",
      mode: "text",
      capturedAt: new Date(1_000).toISOString(),
      screen: "wrong-pane",
      full: true,
    };

    server.use(
      http.get("/api/streams/sessions/pane-1/screen", () => {
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(
              enc.encode(`event: screen\ndata: ${JSON.stringify(wrongPaneResponse)}\n\n`),
            );
          },
          cancel() {},
        });
        return new HttpResponse(stream, {
          headers: { "Content-Type": "text/event-stream" },
        });
      }),
    );

    const requestScreen = vi.fn(() => new Promise<ScreenResponse>(() => {}));
    const setScreen = vi.fn();
    const { result, params } = setup({
      requestScreen,
      setScreen,
      apiBasePath: "/api",
      token: "test-token",
    });

    await waitFor(() => {
      expect(result.current.transport).toBe("sse");
    });
    await act(async () => {});

    expect(setScreen).not.toHaveBeenCalledWith("wrong-pane");
    expect(params.onModeLoaded).not.toHaveBeenCalled();
  });

  it("surfaces an SSE capture error and finishes the initial loading state", async () => {
    const enc = new TextEncoder();
    const screenPayload: ScreenResponse = {
      ok: false,
      paneId: "pane-1",
      mode: "text",
      capturedAt: new Date(0).toISOString(),
      error: { code: "CMUX_UNAVAILABLE", message: "cmux socket closed" },
    };

    server.use(
      http.get("/api/streams/sessions/pane-1/screen", () => {
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(
              enc.encode(`event: screen\ndata: ${JSON.stringify(screenPayload)}\n\n`),
            );
          },
          cancel() {},
        });
        return new HttpResponse(stream, {
          headers: { "Content-Type": "text/event-stream" },
        });
      }),
    );

    const requestScreen = vi.fn(() => new Promise<ScreenResponse>(() => {}));
    const onModeLoaded = vi.fn();
    const { result } = setup({
      requestScreen,
      onModeLoaded,
      apiBasePath: "/api",
      token: "test-token",
    });

    await waitFor(() => {
      expect(result.current.error).toBe("cmux socket closed");
    });
    expect(onModeLoaded).toHaveBeenCalledWith("text");
  });
});
