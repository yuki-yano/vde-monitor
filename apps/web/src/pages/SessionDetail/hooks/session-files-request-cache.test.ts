import { describe, expect, it, vi } from "vitest";

import {
  buildFileContentRequestKey,
  buildSearchRequestKey,
  buildTreePageRequestKey,
  fetchWithRequestMap,
} from "./session-files-request-cache";

describe("useSessionFiles request cache helpers", () => {
  it("deduplicates concurrent requests by key", async () => {
    const requestMapRef = { current: new Map<string, Promise<string>>() };
    const deferred = { resolve: (() => undefined) as (value: string) => void };
    const requestFactory = vi.fn(
      () =>
        new Promise<string>((nextResolve) => {
          deferred.resolve = nextResolve;
        }),
    );

    const first = fetchWithRequestMap({
      requestMapRef,
      requestKey: "pane:src",
      requestFactory,
    });
    const second = fetchWithRequestMap({
      requestMapRef,
      requestKey: "pane:src",
      requestFactory,
    });

    expect(requestFactory).toHaveBeenCalledTimes(1);
    expect(requestMapRef.current.size).toBe(1);

    deferred.resolve("done");
    await expect(first).resolves.toBe("done");
    await expect(second).resolves.toBe("done");
    expect(requestMapRef.current.size).toBe(0);
  });

  it("cleans request map even when request fails", async () => {
    const requestMapRef = { current: new Map<string, Promise<string>>() };
    const requestFactory = vi.fn(async () => {
      throw new Error("boom");
    });

    await expect(
      fetchWithRequestMap({
        requestMapRef,
        requestKey: "pane:src",
        requestFactory,
      }),
    ).rejects.toThrowError("boom");

    expect(requestMapRef.current.size).toBe(0);
  });

  it("builds stable request keys", () => {
    expect(buildTreePageRequestKey("%1", "src", "c1")).toBe("%1:src:c1");
    expect(buildSearchRequestKey("%1", "index", undefined)).toBe("%1:index:");
    expect(buildFileContentRequestKey("%1", "src/index.ts", 123)).toBe("%1:src/index.ts:123:");
    expect(buildFileContentRequestKey("%1", "docs/preview.html", 123, true)).toBe(
      "%1:docs/preview.html:123:ignored-preview",
    );
  });
});
