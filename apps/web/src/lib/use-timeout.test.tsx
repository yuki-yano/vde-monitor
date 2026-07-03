import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useTimeout } from "./use-timeout";

describe("useTimeout", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("runs the callback after delayMs elapses", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useTimeout());
    const callback = vi.fn();

    act(() => {
      result.current.set(callback, 1000);
    });

    expect(callback).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(999);
    });
    expect(callback).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("clears the previous timer when set is called again before it fires", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useTimeout());
    const firstCallback = vi.fn();
    const secondCallback = vi.fn();

    act(() => {
      result.current.set(firstCallback, 1000);
    });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    act(() => {
      result.current.set(secondCallback, 1000);
    });

    act(() => {
      vi.advanceTimersByTime(999);
    });
    expect(firstCallback).not.toHaveBeenCalled();
    expect(secondCallback).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(firstCallback).not.toHaveBeenCalled();
    expect(secondCallback).toHaveBeenCalledTimes(1);
  });

  it("respects a new delayMs passed on a later set call", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useTimeout());
    const callback = vi.fn();

    act(() => {
      result.current.set(callback, 1000);
    });
    act(() => {
      result.current.set(callback, 200);
    });

    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("cancel prevents the pending callback from firing", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useTimeout());
    const callback = vi.fn();

    act(() => {
      result.current.set(callback, 1000);
      result.current.cancel();
    });

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(callback).not.toHaveBeenCalled();
  });

  it("clears the pending timer on unmount", () => {
    vi.useFakeTimers();
    const { result, unmount } = renderHook(() => useTimeout());
    const callback = vi.fn();

    act(() => {
      result.current.set(callback, 1000);
    });
    unmount();

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(callback).not.toHaveBeenCalled();
  });
});
