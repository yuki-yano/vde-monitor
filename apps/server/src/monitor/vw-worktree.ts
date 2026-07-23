import path from "node:path";

import { execa } from "execa";

import { toNullableBoolean, toNullableString } from "@vde-monitor/shared";

import { setMapEntryWithLimit } from "../cache";
import { normalizeAbsolutePath } from "../path-normalization";

const defaultVwSnapshotCacheTtlMs = 3000;
const defaultVwGhRefreshIntervalMs = 30_000;
const monitorFailureRetryMs = 30_000;
const VW_SNAPSHOT_CACHE_MAX_ENTRIES = 50;
const VW_GH_LOOKUP_CACHE_MAX_ENTRIES = 200;
const STALE_CACHE_AT_MS = Number.NEGATIVE_INFINITY;
let vwGhRefreshIntervalMs = defaultVwGhRefreshIntervalMs;
const vwSnapshotCache = new Map<
  string,
  { snapshot: VwWorktreeSnapshot | null; at: number; refreshFailed?: boolean }
>();
const vwSnapshotGeneration = new Map<string, number>();
const inflight = new Map<string, Promise<VwWorktreeSnapshot | null>>();
const ghLookupAt = new Map<string, number>();
const repoRootByCwd = new Map<string, string>();
const cachedWorktreeStateByRepoRoot = new Map<
  string,
  Map<
    string,
    {
      byPR: boolean | null;
      overall: boolean | null;
      prStatus: VwPrStatus | null;
      prUrl: string | null;
    }
  >
>();

type VwSnapshotGhMode = "auto" | "always" | "never";
type VwPrStatus = "none" | "open" | "merged" | "closed_unmerged" | "unknown";

export type ResolveVwWorktreeSnapshotOptions = {
  ghMode?: VwSnapshotGhMode;
  cacheTtlMs?: number;
  monitor?: boolean;
  staleWhileRevalidate?: boolean;
};

export type VwWorktreeEntry = {
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
  pr: {
    status: VwPrStatus | null;
    url?: string | null;
  };
};

export type VwWorktreeSnapshot = {
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
};

export const configureVwGhRefreshIntervalMs = (intervalMs: number) => {
  if (!Number.isFinite(intervalMs) || intervalMs < 0) {
    vwGhRefreshIntervalMs = defaultVwGhRefreshIntervalMs;
    return;
  }
  vwGhRefreshIntervalMs = intervalMs;
};

const isWithinPath = (targetPath: string, rootPath: string) => {
  if (targetPath === rootPath) return true;
  return targetPath.startsWith(`${rootPath}${path.sep}`);
};

const vwPrStatuses = new Set<VwPrStatus>(["none", "open", "merged", "closed_unmerged", "unknown"]);

const toNullablePrStatus = (value: unknown): VwPrStatus | null => {
  if (typeof value !== "string") {
    return null;
  }
  return vwPrStatuses.has(value as VwPrStatus) ? (value as VwPrStatus) : null;
};

const deriveLegacyPrStatus = (mergedByPr: boolean | null): VwPrStatus | null => {
  if (mergedByPr === true) {
    return "merged";
  }
  if (mergedByPr === false) {
    return "none";
  }
  return null;
};

const resolveLookupKey = (cwd: string) => {
  const directRepoRoot = repoRootByCwd.get(cwd);
  if (directRepoRoot) {
    return directRepoRoot;
  }

  let matchedRepoRoot: string | null = null;
  for (const repoRoot of cachedWorktreeStateByRepoRoot.keys()) {
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

const resolveGhLookup = (cwd: string, nowMs: number, ghMode: VwSnapshotGhMode) => {
  if (ghMode === "always") {
    return { key: resolveLookupKey(cwd), ghEnabled: true } as const;
  }
  if (ghMode === "never") {
    return { key: resolveLookupKey(cwd), ghEnabled: false } as const;
  }
  return shouldRunGhLookup(cwd, nowMs);
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

const resolveRelatedCacheKeys = (normalizedCwd: string) => {
  const repoRoot = repoRootByCwd.get(normalizedCwd) ?? normalizedCwd;
  const keys = new Set([normalizedCwd, repoRoot]);
  for (const key of vwSnapshotCache.keys()) {
    if (key === normalizedCwd || key === repoRoot || repoRootByCwd.get(key) === repoRoot) {
      keys.add(key);
    }
  }
  for (const [key, trackedRepoRoot] of repoRootByCwd) {
    if (trackedRepoRoot === repoRoot) {
      keys.add(key);
    }
  }
  return keys;
};

const bumpSnapshotGeneration = (key: string) => {
  const generation = (vwSnapshotGeneration.get(key) ?? 0) + 1;
  setMapEntryWithLimit(vwSnapshotGeneration, key, generation, VW_GH_LOOKUP_CACHE_MAX_ENTRIES);
};

export const clearVwWorktreeSnapshotCache = (cwd: string | null) => {
  const normalizedCwd = normalizeAbsolutePath(cwd);
  if (!normalizedCwd) {
    return;
  }
  for (const key of resolveRelatedCacheKeys(normalizedCwd)) {
    bumpSnapshotGeneration(key);
    vwSnapshotCache.delete(key);
    inflight.delete(`${key}:gh`);
    inflight.delete(`${key}:no-gh`);
  }
};

export const invalidateVwWorktreeSnapshotCache = (cwd: string | null) => {
  const normalizedCwd = normalizeAbsolutePath(cwd);
  if (!normalizedCwd) {
    return;
  }
  for (const key of resolveRelatedCacheKeys(normalizedCwd)) {
    bumpSnapshotGeneration(key);
    const cached = vwSnapshotCache.get(key);
    if (cached) {
      cached.at = STALE_CACHE_AT_MS;
    }
  }
};

const buildCachedStateByBranch = (entries: VwWorktreeEntry[]) => {
  const byBranch = new Map<
    string,
    {
      byPR: boolean | null;
      overall: boolean | null;
      prStatus: VwPrStatus | null;
      prUrl: string | null;
    }
  >();
  entries.forEach((entry) => {
    if (!entry.branch) {
      return;
    }
    byBranch.set(entry.branch, {
      byPR: entry.merged.byPR,
      overall: entry.merged.overall,
      prStatus: entry.pr.status,
      prUrl: entry.pr.url ?? null,
    });
  });
  return byBranch;
};

const applyCachedWorktreeState = (
  repoRoot: string | null,
  entries: VwWorktreeEntry[],
): VwWorktreeEntry[] => {
  if (!repoRoot) {
    return entries;
  }
  const cached = cachedWorktreeStateByRepoRoot.get(repoRoot);
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
    const cachedState = cached.get(entry.branch) ?? {
      byPR: null,
      overall: null,
      prStatus: null,
      prUrl: null,
    };
    if (
      entry.merged.byPR === cachedState.byPR &&
      entry.merged.overall === cachedState.overall &&
      entry.pr.status === cachedState.prStatus &&
      (entry.pr.url ?? null) === cachedState.prUrl
    ) {
      return entry;
    }
    changed = true;
    return {
      ...entry,
      merged: {
        ...entry.merged,
        byPR: cachedState.byPR,
        overall: cachedState.overall,
      },
      pr: {
        ...entry.pr,
        status: cachedState.prStatus,
        url: cachedState.prUrl,
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
    schemaVersion?: unknown;
    command?: unknown;
    status?: unknown;
    repoRoot?: unknown;
    data?: unknown;
    error?: unknown;
  };
  if (
    payload.schemaVersion !== 2 ||
    payload.command !== "list" ||
    payload.status !== "ok" ||
    payload.error !== null ||
    !payload.data ||
    typeof payload.data !== "object"
  ) {
    return null;
  }
  const data = payload.data as {
    baseBranch?: unknown;
    worktrees?: unknown;
  };
  if (!Array.isArray(data.worktrees)) {
    return null;
  }
  const repoRoot = normalizeAbsolutePath(toNullableString(payload.repoRoot));
  const baseBranch = toNullableString(data.baseBranch);
  const entries = data.worktrees
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
        pr?: unknown;
      };
      const normalizedPath = normalizeAbsolutePath(toNullableString(worktree.path));
      if (!normalizedPath) {
        return null;
      }
      const locked = (worktree.locked ?? {}) as {
        value?: unknown;
        owner?: unknown;
        reason?: unknown;
      };
      const merged = (worktree.merged ?? {}) as { overall?: unknown; byPR?: unknown };
      const pr = (worktree.pr ?? {}) as { status?: unknown; url?: unknown };
      const mergedByPr = toNullableBoolean(merged.byPR);
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
          byPR: mergedByPr,
        },
        pr: {
          status: toNullablePrStatus(pr.status) ?? deriveLegacyPrStatus(mergedByPr),
          url: toNullableString(pr.url),
        },
      };
    })
    .filter((entry): entry is VwWorktreeEntry => entry != null)
    .sort((a, b) => b.path.length - a.path.length);
  return { repoRoot, baseBranch, entries };
};

const fetchSnapshot = async (
  cwd: string,
  options: { ghEnabled: boolean; monitor: boolean },
): Promise<VwWorktreeSnapshot | null> => {
  const args = options.ghEnabled ? ["list", "--json"] : ["list", "--json", "--no-gh"];
  if (options.monitor) {
    args.push("--monitor");
  }
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
  options: ResolveVwWorktreeSnapshotOptions = {},
): Promise<VwWorktreeSnapshot | null> => {
  const normalizedCwd = normalizeAbsolutePath(cwd);
  if (!normalizedCwd) {
    return null;
  }
  const ghMode = options.ghMode ?? "auto";
  const cacheTtlMs = options.cacheTtlMs ?? defaultVwSnapshotCacheTtlMs;
  const nowMs = Date.now();
  const ghLookup = resolveGhLookup(normalizedCwd, nowMs, ghMode);
  const shouldBypassCache = ghLookup.ghEnabled;
  const cached = vwSnapshotCache.get(normalizedCwd);
  const effectiveCacheTtlMs =
    options.monitor && cached?.refreshFailed
      ? Math.min(cacheTtlMs, monitorFailureRetryMs)
      : cacheTtlMs;
  if (cached && nowMs - cached.at < effectiveCacheTtlMs && !shouldBypassCache) {
    return cached.snapshot;
  }

  const startRequest = (staleSnapshot?: VwWorktreeSnapshot | null) => {
    const inflightKey = `${normalizedCwd}:${ghLookup.ghEnabled ? "gh" : "no-gh"}`;
    const existing = inflight.get(inflightKey);
    if (existing) {
      return existing;
    }
    if (!ghLookup.ghEnabled) {
      const ghInflight = inflight.get(`${normalizedCwd}:gh`);
      if (ghInflight) {
        return ghInflight;
      }
    }
    if (ghLookup.ghEnabled) {
      markGhLookupAt(ghLookup.key, nowMs);
    }
    const requestGeneration = vwSnapshotGeneration.get(normalizedCwd) ?? 0;

    let request: Promise<VwWorktreeSnapshot | null>;
    request = fetchSnapshot(normalizedCwd, {
      ghEnabled: ghLookup.ghEnabled,
      monitor: options.monitor ?? false,
    })
      .then((snapshot) => {
        if (inflight.get(inflightKey) !== request) {
          return snapshot;
        }
        let resolvedSnapshot = snapshot;
        if (snapshot) {
          trackRepoRoot(normalizedCwd, snapshot.repoRoot);
          if (ghLookup.ghEnabled) {
            setMapEntryWithLimit(
              cachedWorktreeStateByRepoRoot,
              snapshot.repoRoot ?? normalizedCwd,
              buildCachedStateByBranch(snapshot.entries),
              VW_GH_LOOKUP_CACHE_MAX_ENTRIES,
            );
          } else {
            resolvedSnapshot = {
              ...snapshot,
              entries: applyCachedWorktreeState(snapshot.repoRoot, snapshot.entries),
            };
          }
        }

        if (resolvedSnapshot == null && staleSnapshot !== undefined) {
          resolvedSnapshot = staleSnapshot;
        }
        setMapEntryWithLimit(
          vwSnapshotCache,
          normalizedCwd,
          {
            snapshot: resolvedSnapshot,
            at:
              requestGeneration === (vwSnapshotGeneration.get(normalizedCwd) ?? 0)
                ? Date.now()
                : STALE_CACHE_AT_MS,
            refreshFailed: snapshot == null,
          },
          VW_SNAPSHOT_CACHE_MAX_ENTRIES,
        );
        return resolvedSnapshot;
      })
      .finally(() => {
        if (inflight.get(inflightKey) === request) {
          inflight.delete(inflightKey);
        }
      });
    inflight.set(inflightKey, request);
    return request;
  };

  if (cached && options.staleWhileRevalidate && !shouldBypassCache) {
    void startRequest(cached.snapshot).catch(() => undefined);
    return cached.snapshot;
  }

  return startRequest();
};

export const resolveWorktreeStatusFromSnapshot = (
  snapshot: VwWorktreeSnapshot | null,
  cwd: string | null,
): ResolvedWorktreeStatus | null => {
  if (!snapshot) return null;
  const normalizedCwd = normalizeAbsolutePath(cwd);
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
