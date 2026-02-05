// @vitest-environment happy-dom
import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const setup = async () => {
  vi.resetModules();
  const { useRestoreTrigger } = await import("./use-restore-trigger");
  const onRestore = vi.fn();
  const hook = renderHook(() => useRestoreTrigger(onRestore));
  return { onRestore, ...hook };
};

describe("useRestoreTrigger", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
  });

  it("debounces rapid restore events within 1s", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2000));
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
    const addListenerSpy = vi.spyOn(window, "addEventListener");
    const { onRestore, unmount } = await setup();
    await Promise.resolve();
    expect(addListenerSpy).toHaveBeenCalled();
    const focusListener = addListenerSpy.mock.calls.find(
      ([event]) => event === "focus",
    )?.[1] as EventListener;
    const onlineListener = addListenerSpy.mock.calls.find(
      ([event]) => event === "online",
    )?.[1] as EventListener;
    expect(focusListener).toBeDefined();
    expect(onlineListener).toBeDefined();

    focusListener(new Event("focus"));
    onlineListener(new Event("online"));

    expect(onRestore).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date(2500));
    focusListener(new Event("focus"));
    expect(onRestore).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date(3001));
    onlineListener(new Event("online"));
    expect(onRestore).toHaveBeenCalledTimes(2);

    unmount();
  });

  it("does not trigger when hidden or offline", async () => {
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    const addListenerSpy = vi.spyOn(window, "addEventListener");
    const { onRestore, unmount } = await setup();
    await Promise.resolve();
    expect(addListenerSpy).toHaveBeenCalled();
    const focusListener = addListenerSpy.mock.calls.find(
      ([event]) => event === "focus",
    )?.[1] as EventListener;
    const onlineListener = addListenerSpy.mock.calls.find(
      ([event]) => event === "online",
    )?.[1] as EventListener;
    expect(focusListener).toBeDefined();
    expect(onlineListener).toBeDefined();

    focusListener(new Event("focus"));
    onlineListener(new Event("online"));

    expect(onRestore).not.toHaveBeenCalled();

    unmount();
  });
});
