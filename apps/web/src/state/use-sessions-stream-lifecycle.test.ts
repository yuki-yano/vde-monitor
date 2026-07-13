import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { createSseSubscriptionMock } = vi.hoisted(() => ({
  createSseSubscriptionMock: vi.fn(),
}));

vi.mock("@/lib/sse/sse-subscription", () => ({
  createSseSubscription: createSseSubscriptionMock,
}));

import { useSessionsStream } from "./use-sessions-stream";

describe("useSessionsStream lifecycle", () => {
  beforeEach(() => {
    createSseSubscriptionMock.mockReset();
  });

  it("closes the active replacement subscription after a forced reconnect", () => {
    const firstClose = vi.fn();
    const replacementClose = vi.fn();
    createSseSubscriptionMock
      .mockReturnValueOnce({ close: firstClose })
      .mockReturnValueOnce({ close: replacementClose });

    const { unmount } = renderHook(() =>
      useSessionsStream({
        enabled: true,
        apiBaseUrl: "/api",
        token: "token",
        onSnapshot: vi.fn(),
        onUpsert: vi.fn(),
        onRemove: vi.fn(),
        onTransportChange: vi.fn(),
      }),
    );

    document.dispatchEvent(new Event("visibilitychange"));

    expect(createSseSubscriptionMock).toHaveBeenCalledTimes(2);
    expect(firstClose).toHaveBeenCalledOnce();

    unmount();

    expect(replacementClose).toHaveBeenCalledOnce();
  });

  it("does not reconnect when visibility changes to hidden", () => {
    const close = vi.fn();
    createSseSubscriptionMock.mockReturnValue({ close });
    const originalVisibilityState = Object.getOwnPropertyDescriptor(document, "visibilityState");
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });

    const { unmount } = renderHook(() =>
      useSessionsStream({
        enabled: true,
        apiBaseUrl: "/api",
        token: "token",
        onSnapshot: vi.fn(),
        onUpsert: vi.fn(),
        onRemove: vi.fn(),
        onTransportChange: vi.fn(),
      }),
    );

    document.dispatchEvent(new Event("visibilitychange"));

    expect(createSseSubscriptionMock).toHaveBeenCalledOnce();
    expect(close).not.toHaveBeenCalled();
    unmount();
    if (originalVisibilityState != null) {
      Object.defineProperty(document, "visibilityState", originalVisibilityState);
    } else {
      Reflect.deleteProperty(document, "visibilityState");
    }
  });
});
