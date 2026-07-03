import { describe, expect, it } from "vitest";

import { toNullableBoolean, toNullableNumber, toNullableString } from "./coercion";

describe("toNullableBoolean", () => {
  it("passes through booleans", () => {
    expect(toNullableBoolean(true)).toBe(true);
    expect(toNullableBoolean(false)).toBe(false);
  });

  it("returns null for non-boolean values", () => {
    expect(toNullableBoolean(null)).toBeNull();
    expect(toNullableBoolean(undefined)).toBeNull();
    expect(toNullableBoolean("true")).toBeNull();
    expect(toNullableBoolean(0)).toBeNull();
  });
});

describe("toNullableString", () => {
  it("passes through non-empty strings without trimming", () => {
    expect(toNullableString("hello")).toBe("hello");
    expect(toNullableString("  padded  ")).toBe("  padded  ");
  });

  it("returns null for blank or whitespace-only strings", () => {
    expect(toNullableString("")).toBeNull();
    expect(toNullableString("   ")).toBeNull();
  });

  it("returns null for non-string values", () => {
    expect(toNullableString(null)).toBeNull();
    expect(toNullableString(undefined)).toBeNull();
    expect(toNullableString(123)).toBeNull();
    expect(toNullableString(true)).toBeNull();
  });
});

describe("toNullableNumber", () => {
  it("passes through finite numbers", () => {
    expect(toNullableNumber(0)).toBe(0);
    expect(toNullableNumber(-1.5)).toBe(-1.5);
  });

  it("returns null for non-finite numbers", () => {
    expect(toNullableNumber(Number.NaN)).toBeNull();
    expect(toNullableNumber(Number.POSITIVE_INFINITY)).toBeNull();
    expect(toNullableNumber(Number.NEGATIVE_INFINITY)).toBeNull();
  });

  it("returns null for non-number values", () => {
    expect(toNullableNumber(null)).toBeNull();
    expect(toNullableNumber(undefined)).toBeNull();
    expect(toNullableNumber("1")).toBeNull();
  });
});
