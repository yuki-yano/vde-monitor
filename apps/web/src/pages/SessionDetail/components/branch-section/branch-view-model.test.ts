import type { BranchListEntry } from "@vde-monitor/shared";
import { describe, expect, it } from "vitest";

import {
  buildBranchFileChangeCategories,
  resolveBranchPrStatus,
  resolveBranchWorktreeRelativePath,
} from "./branch-view-model";

const entry = (overrides: Partial<BranchListEntry>): BranchListEntry => ({
  name: "feature/foo",
  current: false,
  isDefault: false,
  ahead: null,
  behind: null,
  fileChanges: null,
  additions: null,
  deletions: null,
  merged: null,
  pr: null,
  worktreePath: null,
  committedAt: null,
  ...overrides,
});

describe("resolveBranchPrStatus", () => {
  it("returns null when pr info is absent (gh unavailable)", () => {
    expect(resolveBranchPrStatus(entry({ pr: null }))).toBeNull();
  });

  it("maps pr state to label and class", () => {
    const status = resolveBranchPrStatus(
      entry({ pr: { state: "open", url: "https://example.com", number: 1 } }),
    );
    expect(status?.label).toBe("PR Open");
  });
});

describe("buildBranchFileChangeCategories", () => {
  it("filters zero-count categories", () => {
    const categories = buildBranchFileChangeCategories({ add: 2, m: 0, d: 1 });
    expect(categories.map((c) => c.label)).toEqual(["A", "D"]);
  });

  it("returns empty for null", () => {
    expect(buildBranchFileChangeCategories(null)).toEqual([]);
  });
});

describe("resolveBranchWorktreeRelativePath", () => {
  it("returns relative path for checked-out branch", () => {
    expect(
      resolveBranchWorktreeRelativePath(
        entry({ worktreePath: "/repo/.vde/worktree/foo" }),
        "/repo",
      ),
    ).toBe(".vde/worktree/foo");
  });

  it("returns null when branch has no worktree", () => {
    expect(resolveBranchWorktreeRelativePath(entry({}), "/repo")).toBeNull();
  });

  it("returns null when the worktree is the repo root", () => {
    expect(resolveBranchWorktreeRelativePath(entry({ worktreePath: "/repo" }), "/repo")).toBeNull();
  });
});
