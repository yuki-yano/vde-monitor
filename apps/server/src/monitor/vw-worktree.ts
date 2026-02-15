import path from "node:path";

import { execa } from "execa";

import { setMapEntryWithLimit } from "../cache";

const vwSnapshotCacheTtlMs = 3000;
const defaultVwGhRefreshIntervalMs = 30_000;
const VW_SNAPSHOT_CACHE_MAX_ENTRIES = 50;
const VW_GH_LOOKUP_CACHE_MAX_ENTRIES = 200;
let vwGhRefreshIntervalMs = defaultVwGhRefreshIntervalMs;
const vwSnapshotCache = new Map<string, { snapshot: VwWorktreeSnapshot | null; at: number }>();
const inflight = new Map<string, Promise<VwWorktreeSnapshot | null>>();
const ghLookupAt = new Map<string, number>();
const repoRootByCwd = new Map<string, string>();
const prCreatedByRepoRoot = new Map<string, Map<string, boolean | null>>();

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
    byPR: boolean | null;
  };
};

type VwWorktreeSnapshot = {
  repoRoot: string | null;
  baseBranch: string | null;
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
  worktreePrCreated: boolean | null;
};

export const configureVwGhRefreshIntervalMs = (intervalMs: number) => {
  if (!Number.isFinite(intervalMs) || intervalMs < 0) {
    vwGhRefreshIntervalMs = defaultVwGhRefreshIntervalMs;
    return;
  }
  vwGhRefreshIntervalMs = intervalMs;
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

const resolveLookupKey = (cwd: string) => {
  const directRepoRoot = repoRootByCwd.get(cwd);
  if (directRepoRoot) {
    return directRepoRoot;
  }

  let matchedRepoRoot: string | null = null;
  for (const repoRoot of prCreatedByRepoRoot.keys()) {
    if (
      isWithinPath(cwd, repoRoot) &&
      (!matchedRepoRoot || repoRoot.length > matchedRepoRoot.length)
    ) {
      matchedRepoRoot = repoRoot;
    }
  }
  return matchedRepoRoot ?? cwd;
};

const shouldRunGhLookup = (cwd: string, nowMs: number) => {
  const key = resolveLookupKey(cwd);
  const lastLookupAt = ghLookupAt.get(key);
  if (lastLookupAt == null) {
    return { key, ghEnabled: true } as const;
  }
  return { key, ghEnabled: nowMs - lastLookupAt >= vwGhRefreshIntervalMs } as const;
};

const markGhLookupAt = (key: string, nowMs: number) => {
  setMapEntryWithLimit(ghLookupAt, key, nowMs, VW_GH_LOOKUP_CACHE_MAX_ENTRIES);
};

const trackRepoRoot = (cwd: string, repoRoot: string | null) => {
  if (!repoRoot) {
    return;
  }
  setMapEntryWithLimit(repoRootByCwd, cwd, repoRoot, VW_GH_LOOKUP_CACHE_MAX_ENTRIES);
  if (cwd === repoRoot) {
    return;
  }
  const cwdLookupAt = ghLookupAt.get(cwd);
  if (cwdLookupAt == null) {
    return;
  }
  const repoRootLookupAt = ghLookupAt.get(repoRoot);
  if (repoRootLookupAt == null || cwdLookupAt > repoRootLookupAt) {
    markGhLookupAt(repoRoot, cwdLookupAt);
  }
  ghLookupAt.delete(cwd);
};

const buildPrCreatedByBranch = (entries: VwWorktreeEntry[]) => {
  const byBranch = new Map<string, boolean | null>();
  entries.forEach((entry) => {
    if (!entry.branch) {
      return;
    }
    byBranch.set(entry.branch, entry.merged.byPR);
  });
  return byBranch;
};

const applyCachedPrCreated = (
  repoRoot: string | null,
  entries: VwWorktreeEntry[],
): VwWorktreeEntry[] => {
  if (!repoRoot) {
    return entries;
  }
  const cached = prCreatedByRepoRoot.get(repoRoot);
  if (!cached) {
    return entries;
  }

  let changed = false;
  const nextEntries = entries.map((entry) => {
    if (!entry.branch) {
      return entry;
    }
    if (!cached.has(entry.branch)) {
      return entry;
    }
    const cachedByPr = cached.get(entry.branch) ?? null;
    if (entry.merged.byPR === cachedByPr) {
      return entry;
    }
    changed = true;
    return {
      ...entry,
      merged: {
        ...entry.merged,
        byPR: cachedByPr,
      },
    };
  });

  return changed ? nextEntries : entries;
};

const parseSnapshot = (raw: unknown): VwWorktreeSnapshot | null => {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const payload = raw as {
    status?: unknown;
    repoRoot?: unknown;
    baseBranch?: unknown;
    worktrees?: unknown;
  };
  if (payload.status !== "ok" || !Array.isArray(payload.worktrees)) {
    return null;
  }
  const repoRoot = normalizePath(toNullableString(payload.repoRoot));
  const baseBranch = toNullableString(payload.baseBranch);
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
      const merged = (worktree.merged ?? {}) as { overall?: unknown; byPR?: unknown };
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
          byPR: toNullableBoolean(merged.byPR),
        },
      };
    })
    .filter((entry): entry is VwWorktreeEntry => entry != null)
    .sort((a, b) => b.path.length - a.path.length);
  return { repoRoot, baseBranch, entries };
};

const fetchSnapshot = async (
  cwd: string,
  options: { ghEnabled: boolean },
): Promise<VwWorktreeSnapshot | null> => {
  const args = options.ghEnabled ? ["list", "--json"] : ["list", "--json", "--no-gh"];
  try {
    const result = await execa("vw", args, {
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
  const ghLookup = shouldRunGhLookup(normalizedCwd, nowMs);
  if (ghLookup.ghEnabled) {
    markGhLookupAt(ghLookup.key, nowMs);
  }

  const request = fetchSnapshot(normalizedCwd, { ghEnabled: ghLookup.ghEnabled }).then(
    (snapshot) => {
      let resolvedSnapshot = snapshot;
      if (snapshot) {
        trackRepoRoot(normalizedCwd, snapshot.repoRoot);
        if (ghLookup.ghEnabled) {
          setMapEntryWithLimit(
            prCreatedByRepoRoot,
            snapshot.repoRoot ?? normalizedCwd,
            buildPrCreatedByBranch(snapshot.entries),
            VW_GH_LOOKUP_CACHE_MAX_ENTRIES,
          );
        } else {
          resolvedSnapshot = {
            ...snapshot,
            entries: applyCachedPrCreated(snapshot.repoRoot, snapshot.entries),
          };
        }
      }

      setMapEntryWithLimit(
        vwSnapshotCache,
        normalizedCwd,
        { snapshot: resolvedSnapshot, at: Date.now() },
        VW_SNAPSHOT_CACHE_MAX_ENTRIES,
      );
      inflight.delete(normalizedCwd);
      return resolvedSnapshot;
    },
  );
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
    worktreePrCreated: matched.merged.byPR,
  };
};
