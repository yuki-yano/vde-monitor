import { describe, expect, it, vi } from "vitest";

import {
  buildLogReferenceLinkableCacheKey,
  resolveLogReferenceLinkableWithCache,
} from "./useSessionFiles-log-linkable-cache";

describe("useSessionFiles log linkable cache helpers", () => {
  it("builds stable cache key from normalized inputs", () => {
    expect(
      buildLogReferenceLinkableCacheKey({
        sourcePaneId: "%1",
        sourceRepoRoot: "/repo",
        kind: "path",
        normalizedPath: "src/index.ts",
        filename: null,
        display: "src/index.ts",
      }),
    ).toBe("%1:/repo:path:src/index.ts");
  });

  it("returns cached value without running resolver", async () => {
    const cacheRef = { current: new Map<string, boolean>([["k", true]]) };
    const requestMapRef = { current: new Map<string, Promise<boolean>>() };
    const resolve = vi.fn(async () => false);
    await expect(
      resolveLogReferenceLinkableWithCache({
        cacheRef,
        requestMapRef,
        cacheKey: "k",
        cacheMaxSize: 10,
        resolve,
      }),
    ).resolves.toBe(true);
    expect(resolve).not.toHaveBeenCalled();
  });

  it("deduplicates in-flight requests for the same cache key", async () => {
    const cacheRef = { current: new Map<string, boolean>() };
    const requestMapRef = { current: new Map<string, Promise<boolean>>() };
    const deferred = { resolve: (() => undefined) as (value: boolean) => void };
    const resolve = vi.fn(
      () =>
        new Promise<boolean>((nextResolve) => {
          deferred.resolve = nextResolve;
        }),
    );

    const first = resolveLogReferenceLinkableWithCache({
      cacheRef,
      requestMapRef,
      cacheKey: "k",
      cacheMaxSize: 10,
      resolve,
    });
    const second = resolveLogReferenceLinkableWithCache({
      cacheRef,
      requestMapRef,
      cacheKey: "k",
      cacheMaxSize: 10,
      resolve,
    });

    expect(resolve).toHaveBeenCalledTimes(1);
    deferred.resolve(true);
    await expect(first).resolves.toBe(true);
    await expect(second).resolves.toBe(true);
    expect(requestMapRef.current.size).toBe(0);
    expect(cacheRef.current.get("k")).toBe(true);
  });

  it("evicts the oldest cache entry when max size is reached", async () => {
    const cacheRef = { current: new Map<string, boolean>([["old", false]]) };
    const requestMapRef = { current: new Map<string, Promise<boolean>>() };

    await resolveLogReferenceLinkableWithCache({
      cacheRef,
      requestMapRef,
      cacheKey: "new",
      cacheMaxSize: 1,
      resolve: async () => true,
    });

    expect(cacheRef.current.has("old")).toBe(false);
    expect(cacheRef.current.get("new")).toBe(true);
  });
});
