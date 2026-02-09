import { describe, expect, it } from "vitest";

import { buildSearchExpandPlan } from "./file-tree-search-expand";

describe("buildSearchExpandPlan", () => {
  it("expands all match ancestors when total count is within limit", () => {
    const plan = buildSearchExpandPlan({
      matchedPaths: ["src/app/index.ts", "src/lib/util.ts"],
      activeIndex: 0,
      autoExpandMatchLimit: 100,
      truncated: false,
      totalMatchedCount: 2,
    });

    expect(plan.mode).toBe("all-matches");
    expect(Array.from(plan.expandedDirSet).sort()).toEqual(["src", "src/app", "src/lib"]);
  });

  it("expands only active match ancestors when truncated", () => {
    const plan = buildSearchExpandPlan({
      matchedPaths: ["src/app/index.ts", "src/lib/util.ts"],
      activeIndex: 1,
      autoExpandMatchLimit: 100,
      truncated: true,
      totalMatchedCount: 1000,
    });

    expect(plan.mode).toBe("active-only");
    expect(Array.from(plan.expandedDirSet).sort()).toEqual(["src", "src/lib"]);
  });

  it("clamps active index and handles empty matches", () => {
    const clamped = buildSearchExpandPlan({
      matchedPaths: ["src/app/index.ts"],
      activeIndex: 10,
      autoExpandMatchLimit: 1,
      truncated: true,
      totalMatchedCount: 10,
    });
    expect(Array.from(clamped.expandedDirSet)).toEqual(["src", "src/app"]);

    const empty = buildSearchExpandPlan({
      matchedPaths: [],
      activeIndex: 0,
      autoExpandMatchLimit: 100,
      truncated: false,
      totalMatchedCount: 0,
    });
    expect(empty.mode).toBe("active-only");
    expect(empty.expandedDirSet.size).toBe(0);
  });
});
