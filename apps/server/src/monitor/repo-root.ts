import { setMapEntryWithLimit } from "../cache";
import { resolveRepoRoot as resolveRepoRootShared } from "../git-utils";

const repoRootCacheTtlMs = 10000;
const REPO_ROOT_CACHE_MAX_ENTRIES = 1000;
const repoRootCache = new Map<string, { repoRoot: string | null; at: number }>();

const resolveRepoRoot = async (cwd: string | null) => {
  if (!cwd) return null;
  return resolveRepoRootShared(cwd, {
    timeoutMs: 2000,
    maxBuffer: 2_000_000,
    allowStdoutOnError: false,
  });
};

export const resolveRepoRootCached = async (cwd: string | null) => {
  if (!cwd) return null;
  const normalized = cwd.replace(/\/+$/, "");
  if (!normalized) return null;
  const nowMs = Date.now();
  const cached = repoRootCache.get(normalized);
  if (cached && nowMs - cached.at < repoRootCacheTtlMs) {
    return cached.repoRoot;
  }
  const repoRoot = await resolveRepoRoot(normalized);
  setMapEntryWithLimit(
    repoRootCache,
    normalized,
    { repoRoot, at: nowMs },
    REPO_ROOT_CACHE_MAX_ENTRIES,
  );
  return repoRoot;
};
