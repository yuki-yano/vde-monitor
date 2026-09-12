import { describe, expect, it } from "vitest";

import { blendRgb, contrastRatio, luminance, parseColor } from "./ansi-colors";

describe("ansi-colors", () => {
  it("parses hex colors", () => {
    expect(parseColor("#abc")).toEqual([170, 187, 204]);
    expect(parseColor("#0a1b2c")).toEqual([10, 27, 44]);
  });

  it("parses rgb colors", () => {
    expect(parseColor("rgb(1, 2, 3)")).toEqual([1, 2, 3]);
  });

  it("returns null for invalid colors", () => {
    expect(parseColor("nope")).toBeNull();
  });

  it("matches known luminance and contrast values", () => {
    expect(luminance([0, 0, 0])).toBe(0);
    expect(luminance([255, 255, 255])).toBeCloseTo(1, 5);
    expect(luminance([255, 0, 0])).toBeCloseTo(0.2126, 5);
    expect(luminance([0, 255, 0])).toBeCloseTo(0.7152, 5);
    expect(contrastRatio([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 5);
  });

  it("blends unequal channels with rounding and clamps outside ratios", () => {
    expect(blendRgb([10, 31, 100], [111, 80, 20], 0.25)).toEqual([35, 43, 80]);
    expect(blendRgb([0, 0, 0], [255, 255, 255], 0.5)).toEqual([128, 128, 128]);
    expect(blendRgb([10, 31, 100], [111, 80, 20], 2)).toEqual([111, 80, 20]);
    expect(blendRgb([10, 31, 100], [111, 80, 20], -1)).toEqual([10, 31, 100]);
  });
});
