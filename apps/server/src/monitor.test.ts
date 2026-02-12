import { describe, expect, it, vi } from "vitest";

import { mapWithConcurrencyLimit, mapWithConcurrencyLimitSettled } from "./monitor";

type Deferred = {
  promise: Promise<void>;
  resolve: () => void;
};

const createDeferred = (): Deferred => {
  let resolve = () => {};
  const promise = new Promise<void>((res) => {
    resolve = res;
  });
  return { promise, resolve };
};

describe("mapWithConcurrencyLimit", () => {
  it("processes items in parallel up to limit while preserving result order", async () => {
    const starts: number[] = [];
    const gates = [createDeferred(), createDeferred(), createDeferred()];

    const resultPromise = mapWithConcurrencyLimit([1, 2, 3], 2, async (item) => {
      starts.push(item);
      await gates[item - 1]?.promise;
      return item * 10;
    });

    await vi.waitFor(() => {
      expect(starts).toEqual([1, 2]);
    });

    gates[0]?.resolve();
    await vi.waitFor(() => {
      expect(starts).toEqual([1, 2, 3]);
    });

    gates[1]?.resolve();
    gates[2]?.resolve();
    const result = await resultPromise;
    expect(result).toEqual([10, 20, 30]);
  });

  it("treats non-positive limit as 1", async () => {
    const result = await mapWithConcurrencyLimit([1, 2, 3], 0, async (item) => item + 1);
    expect(result).toEqual([2, 3, 4]);
  });
});

describe("mapWithConcurrencyLimitSettled", () => {
  it("continues processing even when one mapper fails", async () => {
    const calls: number[] = [];
    const result = await mapWithConcurrencyLimitSettled([1, 2, 3], 2, async (item) => {
      calls.push(item);
      if (item === 2) {
        throw new Error("failed:2");
      }
      return item * 100;
    });

    expect(calls).toEqual([1, 2, 3]);
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ status: "fulfilled", value: 100 });
    expect(result[1]?.status).toBe("rejected");
    if (result[1]?.status !== "rejected") {
      throw new Error("expected rejected result at index 1");
    }
    expect(result[1].reason).toBeInstanceOf(Error);
    expect((result[1].reason as Error).message).toBe("failed:2");
    expect(result[2]).toEqual({ status: "fulfilled", value: 300 });
  });

  it("returns empty result for empty input", async () => {
    await expect(mapWithConcurrencyLimitSettled([], 3, async () => 1)).resolves.toEqual([]);
  });
});
