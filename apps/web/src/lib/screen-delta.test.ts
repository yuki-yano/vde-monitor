import { describe, expect, it } from "vitest";

import { applyScreenDeltas } from "./screen-delta";

describe("applyScreenDeltas", () => {
  it("applies multiple deltas in order", () => {
    const before = ["a", "b", "c", "d", "e"];
    const result = applyScreenDeltas(before, [
      { start: 1, deleteCount: 1, insertLines: ["x"] },
      { start: 4, deleteCount: 1, insertLines: ["y"] },
    ]);
    expect(result.ok).toBe(true);
    expect(result.lines).toEqual(["a", "x", "c", "d", "y"]);
  });

  it("adjusts indices after inserts", () => {
    const before = ["a", "b", "c", "d"];
    const result = applyScreenDeltas(before, [
      { start: 1, deleteCount: 0, insertLines: ["x"] },
      { start: 3, deleteCount: 0, insertLines: ["y"] },
    ]);
    expect(result.ok).toBe(true);
    expect(result.lines).toEqual(["a", "x", "b", "c", "y", "d"]);
  });

  it("returns failure when delta is out of range", () => {
    const before = ["a", "b"];
    const result = applyScreenDeltas(before, [{ start: 3, deleteCount: 1, insertLines: ["x"] }]);
    expect(result.ok).toBe(false);
    expect(result.lines).toEqual(before);
  });
});
