import { execa } from "execa";

import { setMapEntryWithLimit } from "../cache";

const prCreatedCacheTtlMs = 60_000;
const PR_CREATED_CACHE_MAX_ENTRIES = 1000;
const prCreatedCache = new Map<string, { value: boolean | null; at: number }>();
const inflight = new Map<string, Promise<boolean | null>>();

const parsePrCreated = (stdout: string): boolean | null => {
  if (!stdout.trim()) {
    return null;
  }
  try {
    const parsed = JSON.parse(stdout) as unknown;
    if (!Array.isArray(parsed)) {
      return null;
    }
    return parsed.length > 0;
  } catch {
    return null;
  }
};

const fetchPrCreated = async (repoRoot: string, branch: string): Promise<boolean | null> => {
  try {
    const result = await execa(
      "gh",
      ["pr", "list", "--head", branch, "--state", "all", "--limit", "1", "--json", "number"],
      {
        cwd: repoRoot,
        reject: false,
        timeout: 5000,
        maxBuffer: 1_000_000,
      },
    );
    if (result.exitCode !== 0) {
      return null;
    }
    return parsePrCreated(result.stdout);
  } catch {
    return null;
  }
};

export const resolvePrCreatedCached = async (
  repoRoot: string | null,
  branch: string | null,
): Promise<boolean | null> => {
  if (!repoRoot || !branch) {
    return null;
  }
  const key = `${repoRoot}:${branch}`;
  const nowMs = Date.now();
  const cached = prCreatedCache.get(key);
  if (cached && nowMs - cached.at < prCreatedCacheTtlMs) {
    return cached.value;
  }
  const existing = inflight.get(key);
  if (existing) {
    return existing;
  }
  const request = fetchPrCreated(repoRoot, branch).then((value) => {
    setMapEntryWithLimit(
      prCreatedCache,
      key,
      { value, at: Date.now() },
      PR_CREATED_CACHE_MAX_ENTRIES,
    );
    inflight.delete(key);
    return value;
  });
  inflight.set(key, request);
  return request;
};
