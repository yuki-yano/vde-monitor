import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { usePushNotifications } from "./use-push-notifications";

const useSessionsMock = vi.fn();

vi.mock("@/state/session-context", () => ({
  useSessions: () => useSessionsMock(),
}));

describe("usePushNotifications", () => {
  let originalIsSecureContext: PropertyDescriptor | undefined;

  beforeEach(() => {
    useSessionsMock.mockReturnValue({
      token: "token",
      apiBaseUrl: "/api",
      authError: null,
    });
    localStorage.clear();
    originalIsSecureContext = Object.getOwnPropertyDescriptor(window, "isSecureContext");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalIsSecureContext) {
      Object.defineProperty(window, "isSecureContext", originalIsSecureContext);
    } else {
      Reflect.deleteProperty(window, "isSecureContext");
    }
  });

  it("reports insecure-context when secure context is unavailable", async () => {
    Object.defineProperty(window, "isSecureContext", { value: false, configurable: true });

    const { result } = renderHook(() => usePushNotifications({ paneId: "%1" }));

    await waitFor(() => {
      expect(result.current.status).toBe("insecure-context");
    });
    expect(result.current.pushEnabled).toBe(false);
  });

  it("does not start subscription flow when token is missing", async () => {
    useSessionsMock.mockReturnValue({
      token: null,
      apiBaseUrl: "/api",
      authError: "Missing token",
    });
    Object.defineProperty(window, "isSecureContext", { value: true, configurable: true });

    const { result } = renderHook(() => usePushNotifications({ paneId: "%1" }));

    await waitFor(() => {
      expect(result.current.status).toBe("idle");
    });
    expect(result.current.isSubscribed).toBe(false);
  });
});
