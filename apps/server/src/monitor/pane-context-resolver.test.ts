import { describe, expect, it, vi } from "vitest";

import { resolvePaneContext } from "./pane-context-resolver";

describe("resolvePaneContext", () => {
  it("uses worktree snapshot when path matches resolved repo root", async () => {
    const worktreePath = "/tmp/project/.worktree/feature/worktree";
    const resolveRepoRoot = vi.fn(async () => worktreePath);
    const resolveWorktreeStatus = vi.fn(() => ({
      repoRoot: "/tmp/project",
      worktreePath,
      branch: "feature/worktree",
      worktreeDirty: true,
      worktreeLocked: false,
      worktreeLockOwner: null,
      worktreeLockReason: null,
      worktreeMerged: false,
    }));
    const resolveBranch = vi.fn(async () => "feature/fallback");

    const context = await resolvePaneContext({
      currentPath: "/tmp/project",
      resolveRepoRoot,
      resolveWorktreeStatus,
      resolveBranch,
    });

    expect(context.repoRoot).toBe("/tmp/project");
    expect(context.branch).toBe("feature/worktree");
    expect(context.worktreePath).toBe(worktreePath);
    expect(context.worktreeDirty).toBe(true);
    expect(resolveBranch).not.toHaveBeenCalled();
  });

  it("falls back to repo and branch resolvers when worktree snapshot does not match", async () => {
    const resolveRepoRoot = vi.fn(async () => "/tmp/project/submodule");
    const resolveWorktreeStatus = vi.fn(() => ({
      repoRoot: "/tmp/project",
      worktreePath: "/tmp/project",
      branch: "main",
      worktreeDirty: true,
      worktreeLocked: true,
      worktreeLockOwner: "codex",
      worktreeLockReason: "mismatch",
      worktreeMerged: false,
    }));
    const resolveBranch = vi.fn(async () => "feature/submodule");

    const context = await resolvePaneContext({
      currentPath: "/tmp/project/submodule",
      resolveRepoRoot,
      resolveWorktreeStatus,
      resolveBranch,
    });

    expect(context.repoRoot).toBe("/tmp/project/submodule");
    expect(context.branch).toBe("feature/submodule");
    expect(context.worktreePath).toBeNull();
    expect(context.worktreeDirty).toBeNull();
    expect(resolveBranch).toHaveBeenCalledWith("/tmp/project/submodule");
  });

  it("resolves pr-created only for vw-managed worktree paths", async () => {
    const worktreePath = "/tmp/project/.worktree/feature/worktree";
    const resolveRepoRoot = vi.fn(async () => worktreePath);
    const resolvePrCreated = vi.fn(async () => true);
    const resolveWorktreeStatus = vi.fn(() => ({
      repoRoot: "/tmp/project",
      worktreePath,
      branch: "feature/worktree",
      worktreeDirty: false,
      worktreeLocked: false,
      worktreeLockOwner: null,
      worktreeLockReason: null,
      worktreeMerged: false,
    }));

    const context = await resolvePaneContext({
      currentPath: "/tmp/project",
      resolveRepoRoot,
      resolveWorktreeStatus,
      resolvePrCreated,
    });

    expect(context.worktreePrCreated).toBe(true);
    expect(resolvePrCreated).toHaveBeenCalledWith("/tmp/project", "feature/worktree");
  });

  it("keeps pr-created null for non-vw worktree paths", async () => {
    const resolveRepoRoot = vi.fn(async () => "/tmp/project");
    const resolvePrCreated = vi.fn(async () => true);
    const resolveWorktreeStatus = vi.fn(() => ({
      repoRoot: "/tmp/project",
      worktreePath: "/tmp/project",
      branch: "main",
      worktreeDirty: false,
      worktreeLocked: false,
      worktreeLockOwner: null,
      worktreeLockReason: null,
      worktreeMerged: false,
    }));

    const context = await resolvePaneContext({
      currentPath: "/tmp/project",
      resolveRepoRoot,
      resolveWorktreeStatus,
      resolvePrCreated,
    });

    expect(context.worktreePrCreated).toBeNull();
    expect(resolvePrCreated).not.toHaveBeenCalled();
  });
});
