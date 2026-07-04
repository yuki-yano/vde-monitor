import type { BranchList, SessionDetail } from "@vde-monitor/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { clearBranchDiffCachesForRepo } from "../../domain/git/git-branch-diff";
import {
  GitCommandError,
  checkoutBranch,
  clearBranchListCache,
  createBranch,
  deleteBranch,
  fetchBranchList,
} from "../../domain/git/git-branches";
import { clearDiffCachesForRepo } from "../../domain/git/git-diff";
import { resolveRepoRoot } from "../../domain/git/git-utils";
import { clearRepoBranchCache } from "../../monitor/repo-branch";
import { clearVwWorktreeSnapshotCache } from "../../monitor/vw-worktree";
import { createBranchRoutes } from "./branch-routes";
import type { RouteContext } from "./types";

vi.mock("../../domain/git/git-branches", () => ({
  GitCommandError: class GitCommandError extends Error {},
  checkoutBranch: vi.fn(),
  clearBranchListCache: vi.fn(),
  createBranch: vi.fn(),
  deleteBranch: vi.fn(),
  fetchBranchList: vi.fn(),
}));

vi.mock("../../domain/git/git-diff", () => ({
  clearDiffCachesForRepo: vi.fn(),
}));

vi.mock("../../domain/git/git-branch-diff", () => ({
  clearBranchDiffCachesForRepo: vi.fn(),
}));

vi.mock("../../domain/git/git-utils", () => ({
  resolveRepoRoot: vi.fn(),
}));

vi.mock("../../monitor/repo-branch", () => ({
  clearRepoBranchCache: vi.fn(),
}));

vi.mock("../../monitor/vw-worktree", () => ({
  clearVwWorktreeSnapshotCache: vi.fn(),
}));

const buildPane = (overrides: Partial<SessionDetail> = {}): SessionDetail => ({
  paneId: "%13",
  sessionName: "dev",
  windowIndex: 1,
  paneIndex: 0,
  paneActive: true,
  currentCommand: "claude",
  currentPath: "/repo",
  paneTty: "/dev/ttys001",
  title: null,
  customTitle: null,
  repoRoot: "/repo",
  branch: "main",
  worktreePath: "/repo",
  agent: "claude",
  state: "RUNNING",
  stateReason: "running",
  lastMessage: null,
  lastOutputAt: null,
  lastEventAt: null,
  lastInputAt: null,
  paneDead: false,
  alternateOn: false,
  pipeAttached: true,
  pipeConflict: false,
  startCommand: "claude",
  panePid: 123,
  agentSessionId: "claude-session-1",
  ...overrides,
});

const buildBranchList = (): BranchList => ({
  repoRoot: "/repo",
  defaultBranch: "main",
  currentBranch: "main",
  entries: [
    {
      name: "main",
      current: true,
      isDefault: true,
      ahead: null,
      behind: null,
      fileChanges: null,
      additions: null,
      deletions: null,
      merged: null,
      pr: null,
      worktreePath: "/repo",
      committedAt: "2026-01-01T00:00:00.000Z",
    },
  ],
});

describe("createBranchRoutes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveRepoRoot).mockResolvedValue("/repo");
  });

  const buildApp = (detail: SessionDetail | Response = buildPane()) => {
    const resolvePane = vi.fn((_c: RouteContext) =>
      detail instanceof Response ? detail : { paneId: "%13", detail },
    );
    const app = createBranchRoutes({ resolvePane });
    return { app, resolvePane };
  };

  it("returns branches from fetchBranchList", async () => {
    const branchList = buildBranchList();
    vi.mocked(fetchBranchList).mockResolvedValueOnce(branchList);
    const { app } = buildApp();

    const res = await app.request("/sessions/%13/branches");

    expect(res.status).toBe(200);
    const json = (await res.json()) as { branches: BranchList };
    expect(json.branches).toEqual(branchList);
    expect(fetchBranchList).toHaveBeenCalledWith("/repo", { force: false });
  });

  it("passes force=1 through to fetchBranchList", async () => {
    vi.mocked(fetchBranchList).mockResolvedValueOnce(buildBranchList());
    const { app } = buildApp();

    await app.request("/sessions/%13/branches?force=1");

    expect(fetchBranchList).toHaveBeenCalledWith("/repo", { force: true });
  });

  it("checks out a branch and invalidates caches on success", async () => {
    vi.mocked(checkoutBranch).mockResolvedValueOnce(undefined);
    const { app } = buildApp();

    const res = await app.request("/sessions/%13/branches/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ branch: "feature/x" }),
    });

    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean };
    expect(json).toEqual({ ok: true });
    expect(checkoutBranch).toHaveBeenCalledWith("/repo", "feature/x");
    expect(clearBranchListCache).toHaveBeenCalledWith("/repo");
    expect(clearDiffCachesForRepo).toHaveBeenCalledWith("/repo");
    expect(clearBranchDiffCachesForRepo).toHaveBeenCalledWith("/repo");
    expect(clearRepoBranchCache).toHaveBeenCalledWith("/repo");
    expect(clearVwWorktreeSnapshotCache).toHaveBeenCalledWith("/repo");
  });

  it("returns 400 with GIT_COMMAND_FAILED when checkout fails", async () => {
    vi.mocked(checkoutBranch).mockRejectedValueOnce(new GitCommandError("error: checkout failed"));
    const { app } = buildApp();

    const res = await app.request("/sessions/%13/branches/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ branch: "feature/x" }),
    });

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string; message: string } };
    expect(json.error).toEqual({
      code: "GIT_COMMAND_FAILED",
      message: "error: checkout failed",
    });
    expect(clearBranchListCache).not.toHaveBeenCalled();
  });

  it("creates a branch with an optional base", async () => {
    vi.mocked(createBranch).mockResolvedValueOnce(undefined);
    const { app } = buildApp();

    const res = await app.request("/sessions/%13/branches", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "feature/y", base: "main" }),
    });

    expect(res.status).toBe(200);
    expect(createBranch).toHaveBeenCalledWith("/repo", "feature/y", "main");
  });

  it("deletes a branch with force flag", async () => {
    vi.mocked(deleteBranch).mockResolvedValueOnce(undefined);
    const { app } = buildApp();

    const res = await app.request("/sessions/%13/branches/delete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "feature/z", force: true }),
    });

    expect(res.status).toBe(200);
    expect(deleteBranch).toHaveBeenCalledWith("/repo", "feature/z", { force: true });
  });

  it("returns 400 when session cwd is unavailable", async () => {
    const { app } = buildApp(buildPane({ currentPath: null, repoRoot: null }));

    const res = await app.request("/sessions/%13/branches/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ branch: "feature/x" }),
    });

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe("REPO_UNAVAILABLE");
    expect(checkoutBranch).not.toHaveBeenCalled();
  });

  it("returns 400 when branch name starts with a dash", async () => {
    const { app } = buildApp();

    const res = await app.request("/sessions/%13/branches/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ branch: "-" }),
    });

    expect(res.status).toBe(400);
    expect(checkoutBranch).not.toHaveBeenCalled();
  });

  it("returns the resolvePane response when pane resolution fails", async () => {
    const errorResponse = new Response(JSON.stringify({ error: { code: "INVALID_PANE" } }), {
      status: 404,
    });
    const { app } = buildApp(errorResponse);

    const res = await app.request("/sessions/%13/branches");

    expect(res.status).toBe(404);
    expect(fetchBranchList).not.toHaveBeenCalled();
  });
});
