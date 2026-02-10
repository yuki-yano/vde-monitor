import { describe, expect, it, vi } from "vitest";

const execaMock = vi.fn();

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
};

const createDeferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve } as Deferred<T>;
};

vi.mock("execa", () => ({
  execa: execaMock,
}));

const loadModule = async () => {
  await vi.resetModules();
  execaMock.mockReset();
  return import("./vw-worktree");
};

describe("resolveVwWorktreeSnapshotCached", () => {
  it("loads snapshot from vw list --json", async () => {
    const { resolveVwWorktreeSnapshotCached } = await loadModule();
    execaMock.mockResolvedValueOnce({
      exitCode: 0,
      stdout: JSON.stringify({
        status: "ok",
        repoRoot: "/repo",
        worktrees: [
          {
            branch: "main",
            path: "/repo",
            dirty: false,
            locked: { value: false, owner: null, reason: null },
            merged: { overall: false },
          },
        ],
      }),
    });

    const snapshot = await resolveVwWorktreeSnapshotCached("/repo");

    expect(snapshot?.repoRoot).toBe("/repo");
    expect(snapshot?.entries).toHaveLength(1);
    expect(execaMock).toHaveBeenCalledWith("vw", ["list", "--json"], expect.any(Object));
  });

  it("caches by normalized cwd", async () => {
    const { resolveVwWorktreeSnapshotCached } = await loadModule();
    execaMock.mockResolvedValueOnce({
      exitCode: 0,
      stdout: JSON.stringify({
        status: "ok",
        repoRoot: "/repo",
        worktrees: [{ branch: "main", path: "/repo", dirty: false, locked: {}, merged: {} }],
      }),
    });

    const first = await resolveVwWorktreeSnapshotCached("/repo/");
    const second = await resolveVwWorktreeSnapshotCached("/repo");

    expect(first?.entries[0]?.path).toBe("/repo");
    expect(second?.entries[0]?.path).toBe("/repo");
    expect(execaMock).toHaveBeenCalledTimes(1);
  });

  it("deduplicates concurrent snapshot requests with inflight cache", async () => {
    const { resolveVwWorktreeSnapshotCached } = await loadModule();
    const deferred = createDeferred<{
      exitCode: number;
      stdout: string;
    }>();
    execaMock.mockReturnValueOnce(deferred.promise);

    const firstPromise = resolveVwWorktreeSnapshotCached("/repo");
    const secondPromise = resolveVwWorktreeSnapshotCached("/repo/");
    await Promise.resolve();

    expect(execaMock).toHaveBeenCalledTimes(1);

    deferred.resolve({
      exitCode: 0,
      stdout: JSON.stringify({
        status: "ok",
        repoRoot: "/repo",
        worktrees: [{ branch: "main", path: "/repo", dirty: false, locked: {}, merged: {} }],
      }),
    });
    const [first, second] = await Promise.all([firstPromise, secondPromise]);
    expect(first?.entries[0]?.path).toBe("/repo");
    expect(second?.entries[0]?.path).toBe("/repo");
    expect(execaMock).toHaveBeenCalledTimes(1);
  });
});

describe("resolveWorktreeStatusFromSnapshot", () => {
  it("matches nested cwd by longest path", async () => {
    const { resolveVwWorktreeSnapshotCached, resolveWorktreeStatusFromSnapshot } =
      await loadModule();
    execaMock.mockResolvedValueOnce({
      exitCode: 0,
      stdout: JSON.stringify({
        status: "ok",
        repoRoot: "/repo",
        worktrees: [
          {
            branch: "main",
            path: "/repo",
            dirty: false,
            locked: { value: false, owner: null, reason: null },
            merged: { overall: false },
          },
          {
            branch: "feature/foo",
            path: "/repo/.worktree/feature/foo",
            dirty: true,
            locked: { value: true, owner: "codex", reason: "in progress" },
            merged: { overall: true },
          },
        ],
      }),
    });
    const snapshot = await resolveVwWorktreeSnapshotCached("/repo");

    const matched = resolveWorktreeStatusFromSnapshot(
      snapshot,
      "/repo/.worktree/feature/foo/apps/web",
    );

    expect(matched).toEqual({
      repoRoot: "/repo",
      worktreePath: "/repo/.worktree/feature/foo",
      branch: "feature/foo",
      worktreeDirty: true,
      worktreeLocked: true,
      worktreeLockOwner: "codex",
      worktreeLockReason: "in progress",
      worktreeMerged: true,
    });
  });
});
