import { describe, expect, it } from "vitest";

import { cn } from "./cn";

describe("cn", () => {
  it("merges class names and drops falsy values", () => {
    expect(cn("flex", undefined, "items-center", null, false, "gap-2")).toBe(
      "flex items-center gap-2",
    );
  });

  it("resolves conflicting Tailwind v4 shadow utilities in favor of the last one", () => {
    expect(cn("shadow-xs", "shadow-lg")).toBe("shadow-lg");
  });

  it("resolves conflicting Tailwind v4 shrink utilities in favor of the last one", () => {
    expect(cn("shrink-0", "shrink")).toBe("shrink");
  });

  it("keeps non-conflicting Tailwind v4 outline utilities from different class groups", () => {
    expect(cn("outline-hidden", "outline-2")).toBe("outline-hidden outline-2");
  });
});
