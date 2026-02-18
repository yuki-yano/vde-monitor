import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { API_ERROR_MESSAGES } from "@/lib/api-messages";

import { useScreenPollingPauseReason } from "./useScreenPollingPauseReason";

describe("useScreenPollingPauseReason", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("tracks hidden state and resumes on visibility change", () => {
    Object.defineProperty(document, "hidden", { value: true, configurable: true });
    const { result } = renderHook(() =>
      useScreenPollingPauseReason({
        connected: true,
        connectionIssue: null,
      }),
    );

    expect(result.current).toBe("hidden");

    Object.defineProperty(document, "hidden", { value: false, configurable: true });
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(result.current).toBeNull();
  });

  it("prioritizes disconnected and unauthorized states", () => {
    const disconnected = renderHook(() =>
      useScreenPollingPauseReason({
        connected: false,
        connectionIssue: null,
      }),
    );
    expect(disconnected.result.current).toBe("disconnected");

    const unauthorized = renderHook(() =>
      useScreenPollingPauseReason({
        connected: true,
        connectionIssue: API_ERROR_MESSAGES.unauthorized,
      }),
    );
    expect(unauthorized.result.current).toBe("unauthorized");
  });
});
