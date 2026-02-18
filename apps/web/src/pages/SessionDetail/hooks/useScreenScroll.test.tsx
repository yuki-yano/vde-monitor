import { act, renderHook } from "@testing-library/react";
import { createStore, Provider as JotaiProvider } from "jotai";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ScreenMode } from "@/lib/screen-loading";

import { screenAtBottomAtom, screenForceFollowAtom } from "../atoms/screenAtoms";
import { useScreenScroll } from "./useScreenScroll";

describe("useScreenScroll", () => {
  const createWrapper = (initialAtBottom = true) => {
    const store = createStore();
    store.set(screenAtBottomAtom, initialAtBottom);
    store.set(screenForceFollowAtom, false);
    return ({ children }: { children: ReactNode }) => (
      <JotaiProvider store={store}>{children}</JotaiProvider>
    );
  };

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("flushes pending updates when user stops scrolling", () => {
    const isUserScrollingRef = { current: false };
    const onFlushPending = vi.fn();
    const onClearPending = vi.fn();

    const wrapper = createWrapper();
    const { result } = renderHook(
      () =>
        useScreenScroll({
          paneId: "pane-1",
          mode: "text",
          screenLinesLength: 1,
          isUserScrollingRef,
          onFlushPending,
          onClearPending,
        }),
      { wrapper },
    );

    act(() => {
      result.current.handleUserScrollStateChange(true);
    });

    expect(isUserScrollingRef.current).toBe(true);

    act(() => {
      result.current.handleUserScrollStateChange(false);
    });

    expect(onFlushPending).toHaveBeenCalledTimes(1);
  });

  it("keeps force follow until reaching bottom", () => {
    vi.useFakeTimers();
    const isUserScrollingRef = { current: false };
    const onFlushPending = vi.fn();
    const onClearPending = vi.fn();

    const wrapper = createWrapper(false);
    const { result } = renderHook(
      () =>
        useScreenScroll({
          paneId: "pane-1",
          mode: "text",
          screenLinesLength: 2,
          isUserScrollingRef,
          onFlushPending,
          onClearPending,
        }),
      { wrapper },
    );

    act(() => {
      result.current.virtuosoRef.current = {
        scrollToIndex: vi.fn(),
      } as unknown as typeof result.current.virtuosoRef.current;
      result.current.scrollerRef.current = {
        scrollTo: vi.fn(),
        scrollHeight: 200,
      } as unknown as HTMLDivElement;
    });

    act(() => {
      result.current.scrollToBottom("auto");
    });

    expect(result.current.forceFollow).toBe(true);

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(result.current.forceFollow).toBe(true);

    act(() => {
      result.current.handleAtBottomChange(true);
    });

    expect(result.current.forceFollow).toBe(false);
    expect(onFlushPending).toHaveBeenCalledTimes(1);
  });

  it("does not enable force follow when already at bottom", () => {
    vi.useFakeTimers();
    const isUserScrollingRef = { current: false };
    const onFlushPending = vi.fn();
    const onClearPending = vi.fn();

    const wrapper = createWrapper(true);
    const { result } = renderHook(
      () =>
        useScreenScroll({
          paneId: "pane-1",
          mode: "text",
          screenLinesLength: 2,
          isUserScrollingRef,
          onFlushPending,
          onClearPending,
        }),
      { wrapper },
    );

    act(() => {
      result.current.virtuosoRef.current = {
        scrollToIndex: vi.fn(),
      } as unknown as typeof result.current.virtuosoRef.current;
      result.current.scrollerRef.current = {
        scrollTo: vi.fn(),
        scrollHeight: 200,
      } as unknown as HTMLDivElement;
      result.current.scrollToBottom("auto");
    });

    expect(result.current.forceFollow).toBe(false);

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(result.current.forceFollow).toBe(false);
  });

  it("clears pending on image mode and snaps on image->text", () => {
    vi.useFakeTimers();
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });

    const isUserScrollingRef = { current: false };
    const onFlushPending = vi.fn();
    const onClearPending = vi.fn();
    const scrollToIndex = vi.fn();
    const scrollTo = vi.fn();

    const wrapper = createWrapper();
    const { result, rerender } = renderHook(
      ({ mode, screenLinesLength }: { mode: ScreenMode; screenLinesLength: number }) =>
        useScreenScroll({
          paneId: "pane-1",
          mode,
          screenLinesLength,
          isUserScrollingRef,
          onFlushPending,
          onClearPending,
        }),
      { initialProps: { mode: "image" as ScreenMode, screenLinesLength: 2 }, wrapper },
    );

    act(() => {
      result.current.virtuosoRef.current = {
        scrollToIndex,
      } as unknown as typeof result.current.virtuosoRef.current;
      result.current.scrollerRef.current = {
        scrollTo,
        scrollHeight: 100,
      } as unknown as HTMLDivElement;
    });

    expect(onClearPending).toHaveBeenCalledTimes(1);
    expect(result.current.isAtBottom).toBe(true);

    rerender({ mode: "text" as ScreenMode, screenLinesLength: 2 });

    act(() => {
      vi.runAllTimers();
    });

    rerender({ mode: "text" as ScreenMode, screenLinesLength: 3 });

    expect(scrollToIndex).toHaveBeenCalled();
  });

  it("snaps to bottom after pane change when text lines arrive", () => {
    vi.useFakeTimers();
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });

    const isUserScrollingRef = { current: false };
    const onFlushPending = vi.fn();
    const onClearPending = vi.fn();
    const scrollToIndex = vi.fn();
    const scrollTo = vi.fn();

    const wrapper = createWrapper();
    const { result, rerender } = renderHook(
      ({ paneId, screenLinesLength }: { paneId: string; screenLinesLength: number }) =>
        useScreenScroll({
          paneId,
          mode: "text",
          screenLinesLength,
          isUserScrollingRef,
          onFlushPending,
          onClearPending,
        }),
      { initialProps: { paneId: "pane-1", screenLinesLength: 0 }, wrapper },
    );

    act(() => {
      result.current.virtuosoRef.current = {
        scrollToIndex,
      } as unknown as typeof result.current.virtuosoRef.current;
      result.current.scrollerRef.current = {
        scrollTo,
        scrollHeight: 120,
      } as unknown as HTMLDivElement;
    });

    rerender({ paneId: "pane-2", screenLinesLength: 0 });
    expect(scrollToIndex).not.toHaveBeenCalled();

    rerender({ paneId: "pane-2", screenLinesLength: 3 });
    expect(scrollToIndex).toHaveBeenCalledWith({
      index: 2,
      align: "end",
      behavior: "auto",
    });
  });
});
