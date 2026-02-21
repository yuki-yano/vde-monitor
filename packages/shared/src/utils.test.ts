import { describe, expect, it } from "vitest";

import { dedupeStrings, isObject } from "./utils";

describe("utils", () => {
  it("dedupeStrings keeps first occurrence order", () => {
    expect(dedupeStrings(["a", "b", "a", "c", "b"])).toEqual(["a", "b", "c"]);
  });

  it("isObject returns true only for non-null objects", () => {
    expect(isObject({ key: "value" })).toBe(true);
    expect(isObject(null)).toBe(false);
    expect(isObject("text")).toBe(false);
    expect(isObject(123)).toBe(false);
  });
});
