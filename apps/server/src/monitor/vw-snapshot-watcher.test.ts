import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { VwWorktreeSnapshot } from "./vw-worktree";
import { createVwSnapshotWatcher } from "./vw-snapshot-watcher";

type ChangeHandler = (eventType: string, filename: string | Buffer | null) => void;

const createSnapshot = (repoRoot: string, paths: string[]): VwWorktreeSnapshot => ({
  repoRoot,
  baseBranch: "main",
  entries: paths.map((path) => ({
    path,
    branch: "main",
    dirty: false,
    locked: { value: false, owner: null, reason: null },
    merged: { overall: false, byPR: null },
    pr: { status: null },
  })),
});

const createWatchHarness = () => {
  const changeByPath = new Map<string, ChangeHandler>();
  const errorByPath = new Map<string, () => void>();
  const closeByPath = new Map<string, Array<ReturnType<typeof vi.fn>>>();
  const watchPath = vi.fn((targetPath: string, onChange: ChangeHandler, onError: () => void) => {
    const close = vi.fn();
    changeByPath.set(targetPath, onChange);
    errorByPath.set(targetPath, onError);
    const closes = closeByPath.get(targetPath) ?? [];
    closes.push(close);
    closeByPath.set(targetPath, closes);
    return { close };
  });

  return {
    changeByPath,
    closeByPath,
    errorByPath,
    triggerEvent: (targetPath: string, eventType: string, filename: string) => {
      changeByPath.get(targetPath)?.(eventType, filename);
    },
    triggerChange: (targetPath: string, filename = "src/index.ts") => {
      changeByPath.get(targetPath)?.("change", filename);
    },
    triggerError: (targetPath: string) => {
      errorByPath.get(targetPath)?.();
    },
    watchPath,
  };
};

describe("createVwSnapshotWatcher", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("invalidates once 30 seconds after the last event in a burst", () => {
    const invalidate = vi.fn();
    const harness = createWatchHarness();
    const watcher = createVwSnapshotWatcher({ invalidate, watchPath: harness.watchPath });
    watcher.observe(createSnapshot("/repo", ["/repo"]));

    harness.triggerChange("/repo");
    vi.advanceTimersByTime(5_000);
    harness.triggerChange("/repo");
    vi.advanceTimersByTime(5_000);
    harness.triggerChange("/repo");

    vi.advanceTimersByTime(29_000);
    expect(invalidate).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1_000);
    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledWith("/repo");
  });

  it("invalidates once at max wait while changes remain continuous", () => {
    const invalidate = vi.fn();
    const harness = createWatchHarness();
    const watcher = createVwSnapshotWatcher({ invalidate, watchPath: harness.watchPath });
    watcher.observe(createSnapshot("/repo", ["/repo"]));

    harness.triggerChange("/repo");
    for (let elapsedMs = 20_000; elapsedMs <= 100_000; elapsedMs += 20_000) {
      vi.advanceTimersByTime(20_000);
      harness.triggerChange("/repo");
    }
    vi.advanceTimersByTime(19_999);
    expect(invalidate).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledWith("/repo");
  });

  it("starts a new max-wait burst after the previous max wait fires", () => {
    const invalidate = vi.fn();
    const harness = createWatchHarness();
    const watcher = createVwSnapshotWatcher({ invalidate, watchPath: harness.watchPath });
    watcher.observe(createSnapshot("/repo", ["/repo"]));

    harness.triggerChange("/repo");
    for (let elapsedMs = 20_000; elapsedMs <= 100_000; elapsedMs += 20_000) {
      vi.advanceTimersByTime(20_000);
      harness.triggerChange("/repo");
    }
    vi.advanceTimersByTime(20_000);
    expect(invalidate).toHaveBeenCalledTimes(1);

    harness.triggerChange("/repo");
    for (let elapsedMs = 20_000; elapsedMs <= 100_000; elapsedMs += 20_000) {
      vi.advanceTimersByTime(20_000);
      harness.triggerChange("/repo");
    }
    vi.advanceTimersByTime(20_000);

    expect(invalidate).toHaveBeenCalledTimes(2);
    expect(invalidate).toHaveBeenNthCalledWith(2, "/repo");
  });

  it("shares one scheduler across multiple watch paths in the same repository", () => {
    const invalidate = vi.fn();
    const harness = createWatchHarness();
    const watcher = createVwSnapshotWatcher({ invalidate, watchPath: harness.watchPath });
    watcher.observe(
      createSnapshot("/repo", ["/repo", "/repo/.worktrees/feature", "/external/feature"]),
    );

    expect(harness.watchPath.mock.calls.map(([targetPath]) => targetPath)).toEqual([
      "/repo",
      "/external/feature",
    ]);

    harness.triggerChange("/repo");
    vi.advanceTimersByTime(10_000);
    harness.triggerChange("/external/feature");
    vi.advanceTimersByTime(29_999);
    expect(invalidate).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledWith("/repo");
  });

  it("schedules different repositories independently", () => {
    const invalidate = vi.fn();
    const harness = createWatchHarness();
    const watcher = createVwSnapshotWatcher({ invalidate, watchPath: harness.watchPath });
    watcher.observe(createSnapshot("/repo-a", ["/repo-a"]));
    watcher.observe(createSnapshot("/repo-b", ["/repo-b"]));

    harness.triggerChange("/repo-a");
    vi.advanceTimersByTime(10_000);
    harness.triggerChange("/repo-b");
    vi.advanceTimersByTime(20_000);

    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenNthCalledWith(1, "/repo-a");

    vi.advanceTimersByTime(10_000);
    expect(invalidate).toHaveBeenCalledTimes(2);
    expect(invalidate).toHaveBeenNthCalledWith(2, "/repo-b");
  });

  it("coalesces watcher errors and allows watcher recreation", () => {
    const invalidate = vi.fn();
    const harness = createWatchHarness();
    const watcher = createVwSnapshotWatcher({ invalidate, watchPath: harness.watchPath });
    const snapshot = createSnapshot("/repo", ["/repo"]);
    watcher.observe(snapshot);

    harness.triggerError("/repo");
    vi.advanceTimersByTime(5_000);
    watcher.observe(snapshot);
    harness.triggerError("/repo");
    vi.advanceTimersByTime(29_999);
    expect(invalidate).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(harness.watchPath).toHaveBeenCalledTimes(2);
    expect(harness.closeByPath.get("/repo")).toHaveLength(2);
    harness.closeByPath.get("/repo")?.forEach((close) => {
      expect(close).toHaveBeenCalledOnce();
    });
  });

  it("coalesces repeated synchronous watch creation failures", () => {
    const invalidate = vi.fn();
    const watchPath = vi.fn(() => {
      throw new Error("watch failed");
    });
    const watcher = createVwSnapshotWatcher({ invalidate, watchPath });
    const snapshot = createSnapshot("/repo", ["/repo"]);

    watcher.observe(snapshot);
    for (let elapsedSeconds = 1; elapsedSeconds < 120; elapsedSeconds += 1) {
      vi.advanceTimersByTime(1_000);
      watcher.observe(snapshot);
    }
    expect(invalidate).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1_000);
    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledWith("/repo");
    expect(watchPath).toHaveBeenCalledTimes(120);
  });

  it("ignores index lock events caused by vw status probes", () => {
    const invalidate = vi.fn();
    const harness = createWatchHarness();
    const watcher = createVwSnapshotWatcher({ invalidate, watchPath: harness.watchPath });
    watcher.observe(createSnapshot("/repo", ["/repo"]));

    harness.triggerChange("/repo", ".git/index.lock");
    harness.triggerChange("/repo", ".git/worktrees/feature/index.lock");
    vi.advanceTimersByTime(120_000);
    expect(invalidate).not.toHaveBeenCalled();

    harness.triggerChange("/repo", ".git/refs/heads/main");
    vi.advanceTimersByTime(30_000);
    expect(invalidate).toHaveBeenCalledOnce();
    expect(invalidate).toHaveBeenCalledWith("/repo");
  });

  it("ignores the periodic Watchman cookie event sequence without hiding real changes", () => {
    const invalidate = vi.fn();
    const harness = createWatchHarness();
    const watcher = createVwSnapshotWatcher({ invalidate, watchPath: harness.watchPath });
    watcher.observe(createSnapshot("/repo", ["/repo"]));

    for (const suffix of [260, 261, 262]) {
      const filename = `.git/.watchman-cookie-phenidate-1377-${suffix}`;
      harness.triggerEvent("/repo", "rename", filename);
      harness.triggerEvent("/repo", "rename", filename);
      harness.triggerEvent("/repo", "rename", filename);
      vi.advanceTimersByTime(60_000);
    }

    expect(invalidate).not.toHaveBeenCalled();

    harness.triggerChange("/repo", "src/index.ts");
    vi.advanceTimersByTime(29_999);
    expect(invalidate).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(invalidate).toHaveBeenCalledOnce();
    expect(invalidate).toHaveBeenCalledWith("/repo");
  });

  it("closes removed watch paths without discarding the repository scheduler", () => {
    const invalidate = vi.fn();
    const harness = createWatchHarness();
    const watcher = createVwSnapshotWatcher({ invalidate, watchPath: harness.watchPath });
    watcher.observe(createSnapshot("/repo", ["/repo", "/external/feature"]));

    harness.triggerChange("/external/feature");
    watcher.observe(createSnapshot("/repo", ["/repo"]));
    expect(harness.closeByPath.get("/external/feature")?.[0]).toHaveBeenCalledOnce();

    vi.advanceTimersByTime(30_000);
    expect(invalidate).toHaveBeenCalledOnce();
    expect(invalidate).toHaveBeenCalledWith("/repo");
  });

  it("cancels the pending timer when a repository is pruned", () => {
    const invalidate = vi.fn();
    const harness = createWatchHarness();
    const watcher = createVwSnapshotWatcher({ invalidate, watchPath: harness.watchPath });
    watcher.observe(createSnapshot("/repo", ["/repo"]));
    harness.triggerChange("/repo");

    watcher.prune(new Set());
    vi.advanceTimersByTime(120_000);

    expect(invalidate).not.toHaveBeenCalled();
    expect(harness.closeByPath.get("/repo")?.[0]).toHaveBeenCalledOnce();
  });

  it("cancels every timer and ignores callbacks after dispose", () => {
    const invalidate = vi.fn();
    const harness = createWatchHarness();
    const watcher = createVwSnapshotWatcher({ invalidate, watchPath: harness.watchPath });
    watcher.observe(createSnapshot("/repo", ["/repo", "/external/feature"]));
    harness.triggerChange("/repo");

    watcher.dispose();
    harness.triggerChange("/repo");
    harness.triggerError("/external/feature");
    vi.advanceTimersByTime(120_000);

    expect(invalidate).not.toHaveBeenCalled();
    expect(harness.closeByPath.get("/repo")?.[0]).toHaveBeenCalledOnce();
    expect(harness.closeByPath.get("/external/feature")?.[0]).toHaveBeenCalledOnce();

    watcher.observe(createSnapshot("/repo", ["/repo", "/after-dispose"]));
    expect(harness.watchPath).toHaveBeenCalledTimes(2);
  });
});
