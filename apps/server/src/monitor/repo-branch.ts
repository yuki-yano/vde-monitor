import path from "node:path";

import { setMapEntryWithLimit } from "../cache";
import { runGit } from "../git-utils";

const repoBranchCacheTtlMs = 3000;
const REPO_BRANCH_CACHE_MAX_ENTRIES = 1000;
const repoBranchCache = new Map<string, { branch: string | null; at: number }>();
const inflight = new Map<string, Promise<string | null>>();

const normalizePath = (value: string | null): string | null => {
  if (!value) return null;
  const resolved = path.resolve(value);
  const normalized = resolved.replace(/[\\/]+$/, "");
  return normalized.length > 0 ? normalized : path.sep;
};

const resolveRepoBranch = async (cwd: string | null) => {
  if (!cwd) return null;
  try {
    const output = await runGit(cwd, ["branch", "--show-current"], {
      timeoutMs: 2000,
      maxBuffer: 2_000_000,
      allowStdoutOnError: false,
    });
    const trimmed = output.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch {
    return null;
  }
};

export const resolveRepoBranchCached = async (cwd: string | null) => {
  const normalized = normalizePath(cwd);
  if (!normalized) return null;
  const nowMs = Date.now();
  const cached = repoBranchCache.get(normalized);
  if (cached && nowMs - cached.at < repoBranchCacheTtlMs) {
    return cached.branch;
  }
  const existing = inflight.get(normalized);
  if (existing) {
    return existing;
  }
  const request = resolveRepoBranch(normalized).then((branch) => {
    setMapEntryWithLimit(
      repoBranchCache,
      normalized,
      { branch, at: Date.now() },
      REPO_BRANCH_CACHE_MAX_ENTRIES,
    );
    inflight.delete(normalized);
    return branch;
  });
  inflight.set(normalized, request);
  return request;
};
