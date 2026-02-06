import { describe, expect, it } from "vitest";

import { buildScreenDeltas, shouldSendFull } from "./screen-diff";

const applyDeltas = (lines: string[], deltas: ReturnType<typeof buildScreenDeltas>) => {
  const next = [...lines];
  deltas.forEach((delta) => {
    next.splice(delta.start, delta.deleteCount, ...delta.insertLines);
  });
  return next;
};

describe("buildScreenDeltas", () => {
  it("returns empty deltas when lines are identical", () => {
    const before = ["a", "b", "c"];
    const deltas = buildScreenDeltas(before, ["a", "b", "c"]);
    expect(deltas).toEqual([]);
  });

  it("produces a single replacement delta for a changed line", () => {
    const before = ["a", "b", "c"];
    const after = ["a", "x", "c"];
    const deltas = buildScreenDeltas(before, after);
    expect(applyDeltas(before, deltas)).toEqual(after);
    expect(deltas).toHaveLength(1);
    expect(deltas[0]).toEqual({ start: 1, deleteCount: 1, insertLines: ["x"] });
  });

  it("produces multiple deltas when changes are separated", () => {
    const before = ["a", "b", "c", "d", "e"];
    const after = ["a", "x", "c", "d", "y"];
    const deltas = buildScreenDeltas(before, after);
    expect(applyDeltas(before, deltas)).toEqual(after);
    expect(deltas.length).toBeGreaterThan(1);
  });

  it("handles insertion from empty input", () => {
    const before: string[] = [];
    const after = ["a", "b"];
    const deltas = buildScreenDeltas(before, after);
    expect(deltas).toEqual([{ start: 0, deleteCount: 0, insertLines: ["a", "b"] }]);
    expect(applyDeltas(before, deltas)).toEqual(after);
  });

  it("handles full deletion to empty output", () => {
    const before = ["a", "b", "c"];
    const after: string[] = [];
    const deltas = buildScreenDeltas(before, after);
    expect(deltas).toEqual([{ start: 0, deleteCount: 3, insertLines: [] }]);
    expect(applyDeltas(before, deltas)).toEqual(after);
  });
});

describe("shouldSendFull", () => {
  it("falls back to full when more than half the lines change", () => {
    const before = Array.from({ length: 10 }, (_, i) => `line-${i}`);
    const after = Array.from({ length: 10 }, (_, i) => `changed-${i}`);
    const deltas = buildScreenDeltas(before, after);
    expect(shouldSendFull(before.length, after.length, deltas)).toBe(true);
  });

  it("falls back to full when change count exceeds 200 lines", () => {
    const before = Array.from({ length: 300 }, (_, i) => `line-${i}`);
    const after = Array.from({ length: 300 }, (_, i) => `changed-${i}`);
    const deltas = buildScreenDeltas(before, after);
    expect(shouldSendFull(before.length, after.length, deltas)).toBe(true);
  });

  it("falls back to full when too many hunks are generated", () => {
    const before = Array.from({ length: 40 }, (_, i) => `line-${i}`);
    const after = [...before];
    for (let i = 0; i < 12; i += 1) {
      after[i * 3] = `changed-${i}`;
    }
    const deltas = buildScreenDeltas(before, after);
    expect(shouldSendFull(before.length, after.length, deltas)).toBe(true);
  });

  it("keeps delta mode for small changes", () => {
    const before = Array.from({ length: 20 }, (_, i) => `line-${i}`);
    const after = [...before];
    after[3] = "line-3-updated";
    after[10] = "line-10-updated";
    const deltas = buildScreenDeltas(before, after);
    expect(shouldSendFull(before.length, after.length, deltas)).toBe(false);
  });
});
