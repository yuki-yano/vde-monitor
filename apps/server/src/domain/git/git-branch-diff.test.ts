import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  runGit: vi.fn(),
  resolveRepoRoot: vi.fn(),
  resolveDefaultBranch: vi.fn(),
}));

vi.mock("./git-utils", () => ({
  runGit: mocks.runGit,
  resolveRepoRoot: mocks.resolveRepoRoot,
}));

vi.mock("./git-branches", () => ({
  resolveDefaultBranch: mocks.resolveDefaultBranch,
}));

import { parseBranchNameStatus, resolveBranchDiffScope } from "./git-branch-diff";

afterEach(() => {
  vi.clearAllMocks();
});

describe("parseBranchNameStatus", () => {
  it("parses A/M/D entries", () => {
    const output = ["A", "added.ts", "M", "modified.ts", "D", "deleted.ts", ""].join("\0");
    expect(parseBranchNameStatus(output)).toEqual([
      { path: "added.ts", status: "A", staged: false, renamedFrom: undefined },
      { path: "modified.ts", status: "M", staged: false, renamedFrom: undefined },
      { path: "deleted.ts", status: "D", staged: false, renamedFrom: undefined },
    ]);
  });

  it("parses rename entries with old and new paths", () => {
    const output = ["R100", "old/name.ts", "new/name.ts", ""].join("\0");
    expect(parseBranchNameStatus(output)).toEqual([
      { path: "new/name.ts", status: "R", staged: false, renamedFrom: "old/name.ts" },
    ]);
  });

  it("returns empty array for empty output", () => {
    expect(parseBranchNameStatus("")).toEqual([]);
  });
});

describe("resolveBranchDiffScope", () => {
  it("returns not_git when the cwd is not inside a git repo", async () => {
    mocks.resolveRepoRoot.mockResolvedValue(null);

    const result = await resolveBranchDiffScope("/not-a-repo", "feature");

    expect(result).toEqual({ ok: false, reason: "not_git" });
    expect(mocks.resolveDefaultBranch).not.toHaveBeenCalled();
  });

  it("returns default_branch_unavailable when no default branch can be resolved", async () => {
    mocks.resolveRepoRoot.mockResolvedValue("/repo");
    mocks.resolveDefaultBranch.mockResolvedValue(null);

    const result = await resolveBranchDiffScope("/repo", "feature");

    expect(result).toEqual({ ok: false, reason: "default_branch_unavailable" });
    expect(mocks.runGit).not.toHaveBeenCalled();
  });

  it("returns unknown_branch when the branch ref cannot be verified", async () => {
    mocks.resolveRepoRoot.mockResolvedValue("/repo");
    mocks.resolveDefaultBranch.mockResolvedValue("main");
    mocks.runGit.mockRejectedValue(new Error("unknown revision"));

    const result = await resolveBranchDiffScope("/repo", "missing-branch");

    expect(result).toEqual({ ok: false, reason: "unknown_branch" });
    expect(mocks.runGit).toHaveBeenCalledWith(
      "/repo",
      ["rev-parse", "--verify", "--quiet", "refs/heads/missing-branch"],
      { allowStdoutOnError: false },
    );
  });

  it("returns ok with the resolved scope when the branch exists", async () => {
    mocks.resolveRepoRoot.mockResolvedValue("/repo");
    mocks.resolveDefaultBranch.mockResolvedValue("main");
    mocks.runGit.mockResolvedValue("sha\n");

    const result = await resolveBranchDiffScope("/repo", "feature");

    expect(result).toEqual({
      ok: true,
      scope: { repoRoot: "/repo", baseBranch: "main", branch: "feature" },
    });
  });
});
