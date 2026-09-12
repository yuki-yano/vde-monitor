import { describe, expect, it } from "vitest";

import { isVwManagedWorktreePath } from "./session-format";

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
