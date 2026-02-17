// @vitest-environment happy-dom
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useVisibilityPolling } from "./use-visibility-polling";

describe("useVisibilityPolling", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    Object.defineProperty(document, "hidden", { value: false, configurable: true });
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
  });

  it("starts polling after visibility resumes from hidden state", () => {
    vi.useFakeTimers();
    Object.defineProperty(document, "hidden", { value: true, configurable: true });
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
    const setIntervalSpy = vi.spyOn(window, "setInterval");
    const addListenerSpy = vi.spyOn(window, "addEventListener");
    const onTick = vi.fn();
    const onResume = vi.fn();

    renderHook(() =>
      useVisibilityPolling({
        enabled: true,
        intervalMs: 1000,
        onTick,
        onResume,
      }),
    );

    expect(setIntervalSpy).not.toHaveBeenCalled();
    const visibilityListener = addListenerSpy.mock.calls.find(
      ([event]) => event === "visibilitychange",
    )?.[1] as EventListener;

    Object.defineProperty(document, "hidden", { value: false, configurable: true });
    act(() => {
      visibilityListener(new Event("visibilitychange"));
    });

    expect(onResume).toHaveBeenCalledTimes(1);
    expect(setIntervalSpy).toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(onTick).toHaveBeenCalledTimes(1);
  });

  it("stops active polling when offline event is received", () => {
    vi.useFakeTimers();
    Object.defineProperty(document, "hidden", { value: false, configurable: true });
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
    const setIntervalSpy = vi.spyOn(window, "setInterval");
    const clearIntervalSpy = vi.spyOn(window, "clearInterval");
    const addListenerSpy = vi.spyOn(window, "addEventListener");
    const onTick = vi.fn();

    renderHook(() =>
      useVisibilityPolling({
        enabled: true,
        intervalMs: 1000,
        onTick,
      }),
    );

    const intervalId = setIntervalSpy.mock.results[0]?.value;
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(onTick).toHaveBeenCalledTimes(1);

    const offlineListener = addListenerSpy.mock.calls.find(
      ([event]) => event === "offline",
    )?.[1] as EventListener;
    act(() => {
      offlineListener(new Event("offline"));
    });

    expect(clearIntervalSpy).toHaveBeenCalledWith(intervalId);
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(onTick).toHaveBeenCalledTimes(1);
  });

  it("triggers resume handler on pageshow", () => {
    vi.useFakeTimers();
    Object.defineProperty(document, "hidden", { value: false, configurable: true });
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
    const addListenerSpy = vi.spyOn(window, "addEventListener");
    const onResume = vi.fn();

    renderHook(() =>
      useVisibilityPolling({
        enabled: true,
        intervalMs: 1000,
        onTick: vi.fn(),
        onResume,
      }),
    );

    const pageShowListener = addListenerSpy.mock.calls.find(
      ([event]) => event === "pageshow",
    )?.[1] as EventListener;
    expect(pageShowListener).toBeDefined();

    act(() => {
      const event = new Event("pageshow") as Event & { persisted?: boolean };
      event.persisted = true;
      pageShowListener(event);
    });

    expect(onResume).toHaveBeenCalledTimes(1);
  });

  it("does not resume on pageshow when page is hidden and not restored from bfcache", () => {
    Object.defineProperty(document, "hidden", { value: true, configurable: true });
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
    const addListenerSpy = vi.spyOn(window, "addEventListener");
    const onResume = vi.fn();

    renderHook(() =>
      useVisibilityPolling({
        enabled: true,
        intervalMs: 1000,
        onTick: vi.fn(),
        onResume,
      }),
    );

    const pageShowListener = addListenerSpy.mock.calls.find(
      ([event]) => event === "pageshow",
    )?.[1] as EventListener;

    act(() => {
      const event = new Event("pageshow") as Event & { persisted?: boolean };
      event.persisted = false;
      pageShowListener(event);
    });

    expect(onResume).not.toHaveBeenCalled();
  });

  it("skips polling and resume callback when shouldPoll returns false", () => {
    Object.defineProperty(document, "hidden", { value: false, configurable: true });
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
    const addListenerSpy = vi.spyOn(window, "addEventListener");
    const setIntervalSpy = vi.spyOn(window, "setInterval");
    const onResume = vi.fn();
    const onTick = vi.fn();

    renderHook(() =>
      useVisibilityPolling({
        enabled: true,
        intervalMs: 1000,
        onTick,
        onResume,
        shouldPoll: () => false,
      }),
    );

    expect(setIntervalSpy).not.toHaveBeenCalled();
    const focusListener = addListenerSpy.mock.calls.find(
      ([event]) => event === "focus",
    )?.[1] as EventListener;
    act(() => {
      focusListener(new Event("focus"));
    });

    expect(onResume).not.toHaveBeenCalled();
    expect(onTick).not.toHaveBeenCalled();
  });

  it("starts polling when shouldPoll changes from false to true", () => {
    vi.useFakeTimers();
    Object.defineProperty(document, "hidden", { value: false, configurable: true });
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
    const onTick = vi.fn();
    const neverPoll: () => boolean = () => false;
    const alwaysPoll: () => boolean = () => true;

    const { rerender } = renderHook(
      ({ shouldPoll }: { shouldPoll: () => boolean }) =>
        useVisibilityPolling({
          enabled: true,
          intervalMs: 1000,
          onTick,
          shouldPoll,
        }),
      { initialProps: { shouldPoll: neverPoll } },
    );

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(onTick).not.toHaveBeenCalled();

    rerender({ shouldPoll: alwaysPoll });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(onTick).toHaveBeenCalledTimes(1);
  });
});
