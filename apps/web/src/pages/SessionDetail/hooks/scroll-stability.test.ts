import { describe, expect, it } from "vitest";

import { __testables, mapAnchorIndex } from "./scroll-stability";

describe("scroll-stability", () => {
  it("maps anchor index when lines are trimmed from the top", () => {
    const prev = ["a", "b", "c", "d", "e"];
    const next = ["c", "d", "e", "f", "g"];
    const anchorIndex = 3; // "d"
    expect(mapAnchorIndex(prev, next, anchorIndex)).toBe(1);
  });

  it("keeps anchor index when lines are appended", () => {
    const prev = ["a", "b"];
    const next = ["a", "b", "c"];
    expect(mapAnchorIndex(prev, next, 0)).toBe(0);
  });

  it("falls back to expected index when anchor text changes", () => {
    const prev = ["a", "b", "c"];
    const next = ["a", "x", "c"];
    expect(mapAnchorIndex(prev, next, 1)).toBe(1);
  });

  it("finds dropped lines via suffix/prefix overlap", () => {
    const { findDropTop } = __testables;
    const prev = ["a", "b", "c", "d"];
    const next = ["c", "d", "e"];
    expect(findDropTop(prev, next)).toBe(2);
  });
});
