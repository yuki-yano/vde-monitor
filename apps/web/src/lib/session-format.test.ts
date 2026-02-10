import { describe, expect, it } from "vitest";

import { isVwManagedWorktreePath, worktreeFlagClass } from "./session-format";

describe("isVwManagedWorktreePath", () => {
  it("returns false for null or non-managed paths", () => {
    expect(isVwManagedWorktreePath(null)).toBe(false);
    expect(isVwManagedWorktreePath("")).toBe(false);
    expect(isVwManagedWorktreePath("/Users/test/repo")).toBe(false);
  });

  it("returns true for .worktree paths", () => {
    expect(isVwManagedWorktreePath("/Users/test/repo/.worktree/feature/foo")).toBe(true);
    expect(isVwManagedWorktreePath("C:\\repo\\.worktree\\feature\\foo")).toBe(true);
  });
});

describe("worktreeFlagClass", () => {
  it("returns highlighted class only when value is true", () => {
    expect(worktreeFlagClass("dirty", true)).toContain("text-latte-red");
    expect(worktreeFlagClass("locked", true)).toContain("text-latte-yellow");
    expect(worktreeFlagClass("pr", true)).toContain("text-latte-green");
    expect(worktreeFlagClass("merged", true)).toContain("text-latte-blue");
  });

  it("returns mono class for false/null/undefined values", () => {
    expect(worktreeFlagClass("dirty", false)).toBe("font-mono");
    expect(worktreeFlagClass("dirty", null)).toBe("font-mono");
    expect(worktreeFlagClass("dirty", undefined)).toBe("font-mono");
  });
});
