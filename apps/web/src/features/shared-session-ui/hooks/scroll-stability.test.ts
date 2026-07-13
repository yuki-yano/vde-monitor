import { describe, expect, it } from "vitest";

import { __testables, mapAnchorIndex } from "@/features/shared-session-ui/hooks/scroll-stability";

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

  it("chooses the duplicate sequence nearest to the expected index", () => {
    const repeated = Array.from({ length: 400 }, () => "same");
    expect(mapAnchorIndex(repeated, repeated.slice(), 200)).toBe(200);
  });

  it("chooses the lower duplicate index when matches are equally near", () => {
    const { findSequenceIndex } = __testables;
    const lines = ["match", "x", "match"];
    expect(findSequenceIndex(lines, ["match"], 1)).toBe(0);
  });

  it("finds dropped lines via suffix/prefix overlap", () => {
    const { findDropTop } = __testables;
    const prev = ["a", "b", "c", "d"];
    const next = ["c", "d", "e"];
    expect(findDropTop(prev, next)).toBe(2);
  });
});
