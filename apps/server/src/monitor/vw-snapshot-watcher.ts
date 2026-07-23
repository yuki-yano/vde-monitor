import { type FSWatcher, watch } from "node:fs";
import path from "node:path";

import { normalizeAbsolutePath } from "../path-normalization";
import { type VwWorktreeSnapshot, invalidateVwWorktreeSnapshotCache } from "./vw-worktree";

type ClosableWatcher = Pick<FSWatcher, "close">;

type WatchChange = (eventType: string, filename: string | Buffer | null) => void;

type WatchPath = (
  targetPath: string,
  onChange: WatchChange,
  onError: () => void,
) => ClosableWatcher;

type CreateVwSnapshotWatcherOptions = {
  invalidate?: (repoRoot: string) => void;
  maxWaitMs?: number;
  quietPeriodMs?: number;
  watchPath?: WatchPath;
};

type PendingInvalidation = {
  maxTimer: ReturnType<typeof setTimeout>;
  quietTimer: ReturnType<typeof setTimeout>;
};

const DEFAULT_QUIET_PERIOD_MS = 30_000;
const DEFAULT_MAX_WAIT_MS = 120_000;

const watchPathDefault: WatchPath = (targetPath, onChange, onError) => {
  const watcher = watch(targetPath, { persistent: false, recursive: true }, onChange);
  watcher.on("error", onError);
  return watcher;
};

const isVwReadSideEffect = (filename: string | Buffer | null) => {
  if (filename == null) {
    return false;
  }
  const segments = filename.toString().split(path.sep);
  if (segments[0] !== ".git") {
    return false;
  }
  const basename = segments.at(-1);
  return (
    basename === "index.lock" ||
    (segments.length === 2 && basename?.startsWith(".watchman-cookie-"))
  );
};

const resolveWatchPaths = (snapshot: VwWorktreeSnapshot) => {
  const candidates = new Set<string>();
  const repoRoot = normalizeAbsolutePath(snapshot.repoRoot);
  if (repoRoot) {
    candidates.add(repoRoot);
  }
  snapshot.entries.forEach((entry) => {
    const entryPath = normalizeAbsolutePath(entry.path);
    if (entryPath) {
      candidates.add(entryPath);
    }
  });
  return [...candidates]
    .sort((left, right) => left.length - right.length)
    .filter(
      (candidate, index, paths) =>
        !paths
          .slice(0, index)
          .some((parent) => candidate === parent || candidate.startsWith(`${parent}${path.sep}`)),
    );
};

export const createVwSnapshotWatcher = ({
  invalidate = invalidateVwWorktreeSnapshotCache,
  maxWaitMs = DEFAULT_MAX_WAIT_MS,
  quietPeriodMs = DEFAULT_QUIET_PERIOD_MS,
  watchPath = watchPathDefault,
}: CreateVwSnapshotWatcherOptions = {}) => {
  const watchersByRepoRoot = new Map<string, Map<string, ClosableWatcher>>();
  const pendingInvalidationByRepoRoot = new Map<string, PendingInvalidation>();
  let disposed = false;

  const clearPendingInvalidation = (repoRoot: string) => {
    const pending = pendingInvalidationByRepoRoot.get(repoRoot);
    if (!pending) {
      return;
    }
    clearTimeout(pending.quietTimer);
    clearTimeout(pending.maxTimer);
    pendingInvalidationByRepoRoot.delete(repoRoot);
  };

  const flushPendingInvalidation = (repoRoot: string, expectedPending: PendingInvalidation) => {
    if (disposed || pendingInvalidationByRepoRoot.get(repoRoot) !== expectedPending) {
      return;
    }
    clearPendingInvalidation(repoRoot);
    invalidate(repoRoot);
  };

  const scheduleInvalidation = (repoRoot: string) => {
    if (disposed) {
      return;
    }
    const existing = pendingInvalidationByRepoRoot.get(repoRoot);
    if (existing) {
      clearTimeout(existing.quietTimer);
      existing.quietTimer = setTimeout(
        () => flushPendingInvalidation(repoRoot, existing),
        quietPeriodMs,
      );
      return;
    }

    let pending: PendingInvalidation;
    const quietTimer = setTimeout(() => flushPendingInvalidation(repoRoot, pending), quietPeriodMs);
    const maxTimer = setTimeout(() => flushPendingInvalidation(repoRoot, pending), maxWaitMs);
    pending = { maxTimer, quietTimer };
    pendingInvalidationByRepoRoot.set(repoRoot, pending);
  };

  const observe = (snapshot: VwWorktreeSnapshot) => {
    if (disposed) {
      return;
    }
    const repoRoot = normalizeAbsolutePath(snapshot.repoRoot);
    if (!repoRoot) {
      return;
    }
    const desiredPaths = new Set(resolveWatchPaths(snapshot));
    const watchers = watchersByRepoRoot.get(repoRoot) ?? new Map<string, ClosableWatcher>();
    watchersByRepoRoot.set(repoRoot, watchers);

    for (const [watchedPath, watcher] of watchers) {
      if (!desiredPaths.has(watchedPath)) {
        watcher.close();
        watchers.delete(watchedPath);
      }
    }

    for (const watchedPath of desiredPaths) {
      if (watchers.has(watchedPath)) {
        continue;
      }
      let watcher: ClosableWatcher;
      const handleError = () => {
        if (disposed || watchers.get(watchedPath) !== watcher) {
          return;
        }
        watcher.close();
        watchers.delete(watchedPath);
        scheduleInvalidation(repoRoot);
      };
      try {
        watcher = watchPath(
          watchedPath,
          (_eventType, filename) => {
            if (
              !disposed &&
              watchers.get(watchedPath) === watcher &&
              !isVwReadSideEffect(filename)
            ) {
              scheduleInvalidation(repoRoot);
            }
          },
          handleError,
        );
        watchers.set(watchedPath, watcher);
      } catch {
        scheduleInvalidation(repoRoot);
      }
    }
  };

  const prune = (activeRepoRoots: Set<string>) => {
    if (disposed) {
      return;
    }
    for (const [repoRoot, watchers] of watchersByRepoRoot) {
      if (activeRepoRoots.has(repoRoot)) {
        continue;
      }
      watchers.forEach((watcher) => watcher.close());
      watchersByRepoRoot.delete(repoRoot);
      clearPendingInvalidation(repoRoot);
    }
    for (const repoRoot of pendingInvalidationByRepoRoot.keys()) {
      if (!activeRepoRoots.has(repoRoot)) {
        clearPendingInvalidation(repoRoot);
      }
    }
  };

  const dispose = () => {
    if (disposed) {
      return;
    }
    disposed = true;
    watchersByRepoRoot.forEach((watchers) => {
      watchers.forEach((watcher) => watcher.close());
    });
    watchersByRepoRoot.clear();
    for (const repoRoot of pendingInvalidationByRepoRoot.keys()) {
      clearPendingInvalidation(repoRoot);
    }
  };

  return { dispose, observe, prune };
};
