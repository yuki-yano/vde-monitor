import { describe, expect, it } from "vitest";

import { setMapEntryWithLimit } from "./cache";

describe("setMapEntryWithLimit", () => {
  it("keeps map size within limit by evicting oldest entries", () => {
    const cache = new Map<string, number>();
    setMapEntryWithLimit(cache, "a", 1, 2);
    setMapEntryWithLimit(cache, "b", 2, 2);
    setMapEntryWithLimit(cache, "c", 3, 2);

    expect(Array.from(cache.keys())).toEqual(["b", "c"]);
  });

  it("refreshes existing key order when updated", () => {
    const cache = new Map<string, number>();
    setMapEntryWithLimit(cache, "a", 1, 2);
    setMapEntryWithLimit(cache, "b", 2, 2);
    setMapEntryWithLimit(cache, "a", 10, 2);
    setMapEntryWithLimit(cache, "c", 3, 2);

    expect(Array.from(cache.entries())).toEqual([
      ["a", 10],
      ["c", 3],
    ]);
  });

  it("clears map when limit is less than 1", () => {
    const cache = new Map<string, number>([
      ["a", 1],
      ["b", 2],
    ]);

    setMapEntryWithLimit(cache, "c", 3, 0);

    expect(cache.size).toBe(0);
  });
});
