import { act, renderHook, waitFor } from "@testing-library/react";
import type { UsageRepositoryActivityResponse } from "@vde-monitor/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RepositoryActivityRange } from "./repository-activity-types";
import { useRepositoryActivityData } from "./useRepositoryActivityData";

const pollingMocks = vi.hoisted(() => ({ useVisibilityPolling: vi.fn() }));

vi.mock("@/lib/use-visibility-polling", () => pollingMocks);

const createResponse = (range: RepositoryActivityRange): UsageRepositoryActivityResponse => ({
  range,
  rangeStart: "2026-07-10T00:00:00.000Z",
  rangeEnd: "2026-07-11T00:00:00.000Z",
  coverage: {
    status: "complete",
    trackingStartedAt: "2026-06-01T00:00:00.000Z",
    gapDurationMs: 0,
    unattributedRunningMs: 0,
    unattributedCompletedRunCount: 0,
    unverifiedCompletedRunCount: 0,
  },
  items: [],
  fetchedAt: "2026-07-11T00:00:00.000Z",
});

const createDeferred = <T,>() => {
  let resolve: ((value: T) => void) | undefined;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve: (value: T) => resolve?.(value) };
};

describe("useRepositoryActivityData", () => {
  beforeEach(() => {
    pollingMocks.useVisibilityPolling.mockReset();
  });

  it("does not expose the previous range while the next range loads", async () => {
    const responses = new Map<
      RepositoryActivityRange,
      ReturnType<typeof createDeferred<UsageRepositoryActivityResponse>>
    >([
      ["24h", createDeferred<UsageRepositoryActivityResponse>()],
      ["7d", createDeferred<UsageRepositoryActivityResponse>()],
    ]);
    const requestRepositoryActivity = vi.fn(
      ({ range }: { range: RepositoryActivityRange }) => responses.get(range)!.promise,
    );
    const { result } = renderHook(() =>
      useRepositoryActivityData({
        canRequest: true,
        requestRepositoryActivity,
        resolveErrorMessage: (_error, fallback) => fallback,
      }),
    );

    await waitFor(() => expect(requestRepositoryActivity).toHaveBeenCalledWith({ range: "24h" }));

    act(() => result.current.setRange("7d"));
    expect(result.current.range).toBe("7d");
    expect(result.current.activity).toBeNull();
    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(requestRepositoryActivity).toHaveBeenCalledWith({ range: "7d" }));
    act(() => {
      responses.get("24h")!.resolve(createResponse("24h"));
    });
    await act(async () => Promise.resolve());
    expect(result.current.activity).toBeNull();

    act(() => {
      responses.get("7d")!.resolve(createResponse("7d"));
    });
    await waitFor(() => expect(result.current.activity?.range).toBe("7d"));
  });

  it("rejects a response for a different range", async () => {
    const requestRepositoryActivity = vi.fn(async () => createResponse("7d"));
    const { result } = renderHook(() =>
      useRepositoryActivityData({
        canRequest: true,
        requestRepositoryActivity,
        resolveErrorMessage: (_error, fallback) => fallback,
      }),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.activity).toBeNull();
    expect(result.current.error).toBe("Failed to load repository activity");
  });

  it("clears visible loading when a silent poll supersedes the foreground request", async () => {
    const foreground = createDeferred<UsageRepositoryActivityResponse>();
    const silent = createDeferred<UsageRepositoryActivityResponse>();
    const requestRepositoryActivity = vi
      .fn()
      .mockReturnValueOnce(foreground.promise)
      .mockReturnValueOnce(silent.promise);
    const resolveErrorMessage = (_error: unknown, fallback: string) => fallback;
    const { result } = renderHook(() =>
      useRepositoryActivityData({
        canRequest: true,
        requestRepositoryActivity,
        resolveErrorMessage,
      }),
    );

    await waitFor(() => expect(requestRepositoryActivity).toHaveBeenCalledTimes(1));
    expect(result.current.loading).toBe(true);

    const pollingOptions = pollingMocks.useVisibilityPolling.mock.calls.at(-1)?.[0] as {
      onTick: () => void;
    };
    act(() => pollingOptions.onTick());
    await waitFor(() => expect(requestRepositoryActivity).toHaveBeenCalledTimes(2));

    act(() => silent.resolve(createResponse("24h")));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.activity?.range).toBe("24h");

    act(() => foreground.resolve(createResponse("24h")));
    await act(async () => Promise.resolve());
    expect(result.current.activity?.range).toBe("24h");
  });
});
