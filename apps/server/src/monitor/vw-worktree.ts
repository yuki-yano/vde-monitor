import path from "node:path";

import { execa } from "execa";

import { setMapEntryWithLimit } from "../cache";

const vwSnapshotCacheTtlMs = 3000;
const VW_SNAPSHOT_CACHE_MAX_ENTRIES = 50;
const vwSnapshotCache = new Map<string, { snapshot: VwWorktreeSnapshot | null; at: number }>();
const inflight = new Map<string, Promise<VwWorktreeSnapshot | null>>();

type VwWorktreeEntry = {
  path: string;
  branch: string | null;
  dirty: boolean | null;
  locked: {
    value: boolean | null;
    owner: string | null;
    reason: string | null;
  };
  merged: {
    overall: boolean | null;
  };
};

type VwWorktreeSnapshot = {
  repoRoot: string | null;
  entries: VwWorktreeEntry[];
};

export type ResolvedWorktreeStatus = {
  repoRoot: string | null;
  worktreePath: string | null;
  branch: string | null;
  worktreeDirty: boolean | null;
  worktreeLocked: boolean | null;
  worktreeLockOwner: string | null;
  worktreeLockReason: string | null;
  worktreeMerged: boolean | null;
};

const normalizePath = (value: string | null): string | null => {
  if (!value) return null;
  const resolved = path.resolve(value);
  const normalized = resolved.replace(/[\\/]+$/, "");
  return normalized.length > 0 ? normalized : path.sep;
};

const isWithinPath = (targetPath: string, rootPath: string) => {
  if (targetPath === rootPath) return true;
  return targetPath.startsWith(`${rootPath}${path.sep}`);
};

const toNullableBoolean = (value: unknown) => (typeof value === "boolean" ? value : null);

const toNullableString = (value: unknown) =>
  typeof value === "string" && value.trim().length > 0 ? value : null;

const parseSnapshot = (raw: unknown): VwWorktreeSnapshot | null => {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const payload = raw as {
    status?: unknown;
    repoRoot?: unknown;
    worktrees?: unknown;
  };
  if (payload.status !== "ok" || !Array.isArray(payload.worktrees)) {
    return null;
  }
  const repoRoot = normalizePath(toNullableString(payload.repoRoot));
  const entries = payload.worktrees
    .map((item): VwWorktreeEntry | null => {
      if (!item || typeof item !== "object") {
        return null;
      }
      const worktree = item as {
        path?: unknown;
        branch?: unknown;
        dirty?: unknown;
        locked?: unknown;
        merged?: unknown;
      };
      const normalizedPath = normalizePath(toNullableString(worktree.path));
      if (!normalizedPath) {
        return null;
      }
      const locked = (worktree.locked ?? {}) as {
        value?: unknown;
        owner?: unknown;
        reason?: unknown;
      };
      const merged = (worktree.merged ?? {}) as { overall?: unknown };
      return {
        path: normalizedPath,
        branch: toNullableString(worktree.branch),
        dirty: toNullableBoolean(worktree.dirty),
        locked: {
          value: toNullableBoolean(locked.value),
          owner: toNullableString(locked.owner),
          reason: toNullableString(locked.reason),
        },
        merged: {
          overall: toNullableBoolean(merged.overall),
        },
      };
    })
    .filter((entry): entry is VwWorktreeEntry => entry != null)
    .sort((a, b) => b.path.length - a.path.length);
  return { repoRoot, entries };
};

const fetchSnapshot = async (cwd: string): Promise<VwWorktreeSnapshot | null> => {
  try {
    const result = await execa("vw", ["list", "--json"], {
      cwd,
      reject: false,
      timeout: 4000,
      maxBuffer: 2_000_000,
    });
    if (result.exitCode !== 0) {
      return null;
    }
    const stdout = result.stdout.trim();
    if (!stdout) {
      return null;
    }
    const parsed = JSON.parse(stdout) as unknown;
    return parseSnapshot(parsed);
  } catch {
    return null;
  }
};

export const resolveVwWorktreeSnapshotCached = async (
  cwd: string,
): Promise<VwWorktreeSnapshot | null> => {
  const normalizedCwd = normalizePath(cwd);
  if (!normalizedCwd) {
    return null;
  }
  const nowMs = Date.now();
  const cached = vwSnapshotCache.get(normalizedCwd);
  if (cached && nowMs - cached.at < vwSnapshotCacheTtlMs) {
    return cached.snapshot;
  }
  const existing = inflight.get(normalizedCwd);
  if (existing) {
    return existing;
  }
  const request = fetchSnapshot(normalizedCwd).then((snapshot) => {
    setMapEntryWithLimit(
      vwSnapshotCache,
      normalizedCwd,
      { snapshot, at: Date.now() },
      VW_SNAPSHOT_CACHE_MAX_ENTRIES,
    );
    inflight.delete(normalizedCwd);
    return snapshot;
  });
  inflight.set(normalizedCwd, request);
  return request;
};

export const resolveWorktreeStatusFromSnapshot = (
  snapshot: VwWorktreeSnapshot | null,
  cwd: string | null,
): ResolvedWorktreeStatus | null => {
  if (!snapshot) return null;
  const normalizedCwd = normalizePath(cwd);
  if (!normalizedCwd) return null;
  const matched = snapshot.entries.find((entry) => isWithinPath(normalizedCwd, entry.path));
  if (!matched) return null;
  return {
    repoRoot: snapshot.repoRoot ?? null,
    worktreePath: matched.path,
    branch: matched.branch,
    worktreeDirty: matched.dirty,
    worktreeLocked: matched.locked.value,
    worktreeLockOwner: matched.locked.owner,
    worktreeLockReason: matched.locked.reason,
    worktreeMerged: matched.merged.overall,
  };
};
