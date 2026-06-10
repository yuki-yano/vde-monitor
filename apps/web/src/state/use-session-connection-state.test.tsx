import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { API_ERROR_MESSAGES } from "@/lib/api-messages";

import type { RefreshSessionsResult } from "./use-session-api";
import { useSessionConnectionState } from "./use-session-connection-state";

const okResult: RefreshSessionsResult = {
  ok: true,
};

const failedResult = (options: {
  authError?: boolean;
  rateLimited?: boolean;
}): RefreshSessionsResult => ({
  ok: false,
  status: options.authError ? 401 : options.rateLimited ? 429 : 500,
  authError: options.authError === true,
  rateLimited: options.rateLimited === true,
});

describe("useSessionConnectionState", () => {
  it("marks auth errors as blocked and resets after a successful refresh", () => {
    const { result } = renderHook(() => useSessionConnectionState("token"));

    act(() => {
      result.current.handleRefreshResult(failedResult({ authError: true }));
    });

    expect(result.current.authBlocked).toBe(true);
    expect(result.current.connected).toBe(false);
    expect(result.current.connectionStatus).toBe("disconnected");

    act(() => {
      result.current.handleRefreshResult(okResult);
    });

    expect(result.current.authBlocked).toBe(false);
    expect(result.current.connected).toBe(true);
    expect(result.current.connectionStatus).toBe("healthy");
  });

  it("backs off rate-limited polling in 5 second steps up to 15 seconds", () => {
    const { result } = renderHook(() => useSessionConnectionState("token"));

    act(() => {
      result.current.handleRefreshResult(failedResult({ rateLimited: true }));
    });
    expect(result.current.pollBackoffMs).toBe(5_000);
    expect(result.current.connected).toBe(true);
    expect(result.current.connectionStatus).toBe("degraded");

    act(() => {
      result.current.handleRefreshResult(failedResult({ rateLimited: true }));
      result.current.handleRefreshResult(failedResult({ rateLimited: true }));
      result.current.handleRefreshResult(failedResult({ rateLimited: true }));
    });

    expect(result.current.pollBackoffMs).toBe(15_000);

    act(() => {
      result.current.handleRefreshResult(okResult);
    });

    expect(result.current.pollBackoffMs).toBe(0);
    expect(result.current.connectionStatus).toBe("healthy");
  });

  it("treats unauthorized connection issues as auth blocked and reconnect clears it", () => {
    const refreshSessions = vi.fn(async () => {});
    const { result } = renderHook(() => useSessionConnectionState("token"));

    act(() => {
      result.current.setConnectionIssue(API_ERROR_MESSAGES.unauthorized);
    });

    expect(result.current.authBlocked).toBe(true);
    expect(result.current.connected).toBe(false);
    expect(result.current.connectionStatus).toBe("disconnected");

    act(() => {
      result.current.reconnect(refreshSessions);
    });

    expect(refreshSessions).toHaveBeenCalledTimes(1);
    expect(result.current.authBlocked).toBe(false);
    expect(result.current.connectionIssue).toBe("Reconnecting...");
  });

  it("resets connection state when token changes", () => {
    const { result, rerender } = renderHook(
      ({ token }: { token: string | null }) => useSessionConnectionState(token),
      {
        initialProps: { token: "first-token" },
      },
    );

    act(() => {
      result.current.handleRefreshResult(failedResult({ rateLimited: true }));
      result.current.setConnectionIssue("temporary");
    });

    rerender({ token: "second-token" });

    expect(result.current.connected).toBe(false);
    expect(result.current.authBlocked).toBe(false);
    expect(result.current.pollBackoffMs).toBe(0);
    expect(result.current.connectionIssue).toBeNull();
  });
});
