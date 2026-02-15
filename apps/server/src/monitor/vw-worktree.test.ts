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

  it("uses --no-gh within refresh interval and reuses cached PR state", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
      const { resolveVwWorktreeSnapshotCached, resolveWorktreeStatusFromSnapshot } =
        await loadModule();
      execaMock.mockResolvedValueOnce({
        exitCode: 0,
        stdout: JSON.stringify({
          status: "ok",
          repoRoot: "/repo",
          worktrees: [
            {
              branch: "feature/foo",
              path: "/repo/.worktree/feature/foo",
              dirty: false,
              locked: {},
              merged: { overall: false, byPR: true },
            },
          ],
        }),
      });

      const first = await resolveVwWorktreeSnapshotCached("/repo");
      expect(execaMock).toHaveBeenNthCalledWith(1, "vw", ["list", "--json"], expect.any(Object));
      expect(
        resolveWorktreeStatusFromSnapshot(first, "/repo/.worktree/feature/foo")?.worktreePrCreated,
      ).toBe(true);

      vi.setSystemTime(new Date("2026-01-01T00:00:03.100Z"));
      execaMock.mockResolvedValueOnce({
        exitCode: 0,
        stdout: JSON.stringify({
          status: "ok",
          repoRoot: "/repo",
          worktrees: [
            {
              branch: "feature/foo",
              path: "/repo/.worktree/feature/foo",
              dirty: false,
              locked: {},
              merged: { overall: false, byPR: null },
            },
          ],
        }),
      });
      const second = await resolveVwWorktreeSnapshotCached("/repo");

      expect(execaMock).toHaveBeenNthCalledWith(
        2,
        "vw",
        ["list", "--json", "--no-gh"],
        expect.any(Object),
      );
      expect(
        resolveWorktreeStatusFromSnapshot(second, "/repo/.worktree/feature/foo")?.worktreePrCreated,
      ).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("respects configurable gh refresh interval", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
      const { configureVwGhRefreshIntervalMs, resolveVwWorktreeSnapshotCached } =
        await loadModule();
      configureVwGhRefreshIntervalMs(10_000);

      execaMock.mockResolvedValueOnce({
        exitCode: 0,
        stdout: JSON.stringify({
          status: "ok",
          repoRoot: "/repo",
          worktrees: [{ branch: "main", path: "/repo", dirty: false, locked: {}, merged: {} }],
        }),
      });
      await resolveVwWorktreeSnapshotCached("/repo");
      expect(execaMock).toHaveBeenNthCalledWith(1, "vw", ["list", "--json"], expect.any(Object));

      vi.setSystemTime(new Date("2026-01-01T00:00:03.100Z"));
      execaMock.mockResolvedValueOnce({
        exitCode: 0,
        stdout: JSON.stringify({
          status: "ok",
          repoRoot: "/repo",
          worktrees: [{ branch: "main", path: "/repo", dirty: false, locked: {}, merged: {} }],
        }),
      });
      await resolveVwWorktreeSnapshotCached("/repo");
      expect(execaMock).toHaveBeenNthCalledWith(
        2,
        "vw",
        ["list", "--json", "--no-gh"],
        expect.any(Object),
      );

      vi.setSystemTime(new Date("2026-01-01T00:00:10.300Z"));
      execaMock.mockResolvedValueOnce({
        exitCode: 0,
        stdout: JSON.stringify({
          status: "ok",
          repoRoot: "/repo",
          worktrees: [{ branch: "main", path: "/repo", dirty: false, locked: {}, merged: {} }],
        }),
      });
      await resolveVwWorktreeSnapshotCached("/repo");
      expect(execaMock).toHaveBeenNthCalledWith(3, "vw", ["list", "--json"], expect.any(Object));
    } finally {
      vi.useRealTimers();
    }
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
      worktreePrCreated: null,
    });
  });
});
