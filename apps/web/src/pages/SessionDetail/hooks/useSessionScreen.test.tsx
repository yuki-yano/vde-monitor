import { act, renderHook, waitFor } from "@testing-library/react";
import { createStore, Provider as JotaiProvider } from "jotai";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { initialScreenLoadingState } from "@/lib/screen-loading";

import {
  screenAtBottomAtom,
  screenErrorAtom,
  screenFallbackReasonAtom,
  screenForceFollowAtom,
  screenImageAtom,
  screenLoadingAtom,
  screenModeAtom,
  screenModeLoadedAtom,
  screenTextAtom,
} from "../atoms/screenAtoms";
import { paneIdAtom, sessionsAtom } from "../atoms/sessionDetailAtoms";
import { useSessionScreen } from "./useSessionScreen";

vi.mock("@/lib/ansi", () => ({
  renderAnsiLines: (text: string) => text.split("\n"),
}));

describe("useSessionScreen", () => {
  const createWrapper = () => {
    const store = createStore();
    store.set(paneIdAtom, "pane-1");
    store.set(sessionsAtom, []);
    store.set(screenModeAtom, "text");
    store.set(screenModeLoadedAtom, { text: false, image: false });
    store.set(screenAtBottomAtom, true);
    store.set(screenForceFollowAtom, false);
    store.set(screenTextAtom, "");
    store.set(screenImageAtom, null);
    store.set(screenFallbackReasonAtom, null);
    store.set(screenErrorAtom, null);
    store.set(screenLoadingAtom, initialScreenLoadingState);
    return ({ children }: { children: ReactNode }) => (
      <JotaiProvider store={store}>{children}</JotaiProvider>
    );
  };

  it("sets disconnected error when not connected", async () => {
    const requestScreen = vi.fn();
    const wrapper = createWrapper();
    const { result } = renderHook(
      () =>
        useSessionScreen({
          paneId: "pane-1",
          connected: false,
          connectionIssue: null,
          requestScreen,
        }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.error).toBe("Disconnected. Reconnecting...");
    });

    expect(result.current.isScreenLoading).toBe(true);
  });

  it("shows loading before first response arrives", () => {
    const requestScreen = vi.fn().mockImplementation(() => new Promise<never>(() => {}));
    const wrapper = createWrapper();
    const { result } = renderHook(
      () =>
        useSessionScreen({
          paneId: "pane-1",
          connected: true,
          connectionIssue: null,
          requestScreen,
        }),
      { wrapper },
    );

    expect(result.current.isScreenLoading).toBe(true);
  });

  it("loads screen lines when connected", async () => {
    const requestScreen = vi.fn().mockResolvedValue({
      ok: true,
      paneId: "pane-1",
      mode: "text",
      capturedAt: new Date(0).toISOString(),
      screen: "hello",
    });

    const wrapper = createWrapper();
    const { result } = renderHook(
      () =>
        useSessionScreen({
          paneId: "pane-1",
          connected: true,
          connectionIssue: null,
          requestScreen,
        }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.screenLines).toEqual(["hello"]);
    });
  });

  it("keeps screen lines when disconnected", async () => {
    const requestScreen = vi.fn().mockResolvedValue({
      ok: true,
      paneId: "pane-1",
      mode: "text",
      capturedAt: new Date(0).toISOString(),
      screen: "hello",
    });

    const wrapper = createWrapper();
    const { result, rerender } = renderHook(
      ({ connected }) =>
        useSessionScreen({
          paneId: "pane-1",
          connected,
          connectionIssue: null,
          requestScreen,
        }),
      { wrapper, initialProps: { connected: true } },
    );

    await waitFor(() => {
      expect(result.current.screenLines).toEqual(["hello"]);
    });

    rerender({ connected: false });

    await waitFor(() => {
      expect(result.current.screenLines).toEqual(["hello"]);
    });
  });

  it("applies deltas when cursor is provided", async () => {
    const requestScreen = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        paneId: "pane-1",
        mode: "text",
        capturedAt: new Date(0).toISOString(),
        cursor: "cursor-1",
        screen: "hello\nworld",
        full: true,
      })
      .mockResolvedValueOnce({
        ok: true,
        paneId: "pane-1",
        mode: "text",
        capturedAt: new Date(0).toISOString(),
        cursor: "cursor-2",
        full: false,
        deltas: [{ start: 1, deleteCount: 1, insertLines: ["world!"] }],
      });

    const wrapper = createWrapper();
    const { result } = renderHook(
      () =>
        useSessionScreen({
          paneId: "pane-1",
          connected: true,
          connectionIssue: null,
          requestScreen,
        }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.screenLines).toEqual(["hello", "world"]);
    });

    await act(async () => {
      await result.current.refreshScreen();
    });

    expect(requestScreen).toHaveBeenLastCalledWith("pane-1", { mode: "text", cursor: "cursor-1" });

    await waitFor(() => {
      expect(result.current.screenLines).toEqual(["hello", "world!"]);
    });
  });

  it("changes mode via handler", () => {
    const requestScreen = vi.fn().mockResolvedValue({
      ok: true,
      paneId: "pane-1",
      mode: "text",
      capturedAt: new Date(0).toISOString(),
      screen: "hello",
    });

    const wrapper = createWrapper();
    const { result } = renderHook(
      () =>
        useSessionScreen({
          paneId: "pane-1",
          connected: true,
          connectionIssue: null,
          requestScreen,
        }),
      { wrapper },
    );

    act(() => {
      result.current.handleModeChange("image");
    });

    expect(result.current.mode).toBe("image");
  });

  it("suppresses updates while user is scrolling", async () => {
    const requestScreen = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        paneId: "pane-1",
        mode: "text",
        capturedAt: new Date(0).toISOString(),
        screen: "first",
      })
      .mockResolvedValueOnce({
        ok: true,
        paneId: "pane-1",
        mode: "text",
        capturedAt: new Date(0).toISOString(),
        screen: "first\nsecond",
      });

    const wrapper = createWrapper();
    const { result } = renderHook(
      () =>
        useSessionScreen({
          paneId: "pane-1",
          connected: true,
          connectionIssue: null,
          requestScreen,
        }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.screenLines).toEqual(["first"]);
    });

    act(() => {
      result.current.handleAtBottomChange(false);
      result.current.handleUserScrollStateChange(true);
    });

    await act(async () => {
      await result.current.refreshScreen();
    });

    expect(result.current.screenLines).toEqual(["first"]);

    act(() => {
      result.current.handleUserScrollStateChange(false);
    });

    await waitFor(() => {
      expect(result.current.screenLines).toEqual(["first", "second"]);
    });
  });

  it("keeps the latest buffered update when multiple refreshes happen", async () => {
    const requestScreen = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        paneId: "pane-1",
        mode: "text",
        capturedAt: new Date(0).toISOString(),
        screen: "first",
      })
      .mockResolvedValueOnce({
        ok: true,
        paneId: "pane-1",
        mode: "text",
        capturedAt: new Date(0).toISOString(),
        screen: "first\nsecond",
      })
      .mockResolvedValueOnce({
        ok: true,
        paneId: "pane-1",
        mode: "text",
        capturedAt: new Date(0).toISOString(),
        screen: "first\nsecond\nthird",
      });

    const wrapper = createWrapper();
    const { result } = renderHook(
      () =>
        useSessionScreen({
          paneId: "pane-1",
          connected: true,
          connectionIssue: null,
          requestScreen,
        }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.screenLines).toEqual(["first"]);
    });

    act(() => {
      result.current.handleAtBottomChange(false);
      result.current.handleUserScrollStateChange(true);
    });

    await act(async () => {
      await result.current.refreshScreen();
      await result.current.refreshScreen();
    });

    expect(result.current.screenLines).toEqual(["first"]);

    act(() => {
      result.current.handleUserScrollStateChange(false);
    });

    await waitFor(() => {
      expect(result.current.screenLines).toEqual(["first", "second", "third"]);
    });
  });
});
