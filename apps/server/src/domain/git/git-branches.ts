import type { BranchList, BranchListEntry } from "@vde-monitor/shared";

import { setMapEntryWithLimit } from "../../cache";
import { mapWithConcurrencyLimit } from "../../monitor/concurrency";
import { fetchBranchPrMap } from "./branch-pr-status";
import { GIT_CACHE_TTL_MS } from "./git-common";
import { resolveGitRepoContext, shouldReuseGitCache } from "./git-query-context";
import { runGit } from "./git-utils";

const LIST_CACHE_MAX_ENTRIES = 50;
const STATS_CACHE_MAX_ENTRIES = 1000;
const STRICT_GIT_OPTIONS = {
  timeoutMs: 10_000,
  maxBuffer: 1_000_000,
  allowStdoutOnError: false,
} as const;

const listCache = new Map<string, { at: number; list: BranchList }>();
// Stats for a (base sha, branch sha) pair never change, so entries need no TTL.
const statsCache = new Map<string, BranchStats>();

export class GitCommandError extends Error {}

const toGitCommandError = (err: unknown, fallback: string): GitCommandError => {
  if (err && typeof err === "object" && "stderr" in err) {
    const { stderr } = err as { stderr?: unknown };
    if (typeof stderr === "string" && stderr.trim().length > 0) {
      return new GitCommandError(stderr.trim());
    }
  }
  if (err instanceof Error && err.message) {
    return new GitCommandError(err.message);
  }
  return new GitCommandError(fallback);
};

export type ParsedBranchRef = {
  name: string;
  committedAt: string | null;
  current: boolean;
  sha: string | null;
};

export const parseForEachRefBranches = (output: string): ParsedBranchRef[] =>
  output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .flatMap((line) => {
      const [name, committedAt, headMarker, sha] = line.split("\x00");
      if (!name) {
        return [];
      }
      return [
        {
          name,
          committedAt: committedAt && committedAt.length > 0 ? committedAt : null,
          current: headMarker === "*",
          sha: sha && sha.length > 0 ? sha : null,
        },
      ];
    });

export const parseWorktreeBranchMap = (output: string): Map<string, string> => {
  const map = new Map<string, string>();
  let currentPath: string | null = null;
  output.split("\n").forEach((line) => {
    if (line.startsWith("worktree ")) {
      currentPath = line.slice("worktree ".length).trim();
      return;
    }
    if (line.startsWith("branch refs/heads/") && currentPath) {
      map.set(line.slice("branch refs/heads/".length).trim(), currentPath);
      return;
    }
    if (line.trim().length === 0) {
      currentPath = null;
    }
  });
  return map;
};

export const parseMergedBranchNames = (output: string): Set<string> =>
  new Set(
    output
      .split("\n")
      .map((line) => line.replace(/^[*+]\s*/, "").trim())
      .filter((line) => line.length > 0),
  );

export const sortBranchEntries = (entries: BranchListEntry[]): BranchListEntry[] =>
  [...entries].sort((a, b) => {
    if (a.isDefault !== b.isDefault) {
      return a.isDefault ? -1 : 1;
    }
    if (a.committedAt == null && b.committedAt == null) {
      return a.name.localeCompare(b.name);
    }
    if (a.committedAt == null) {
      return 1;
    }
    if (b.committedAt == null) {
      return -1;
    }
    return b.committedAt.localeCompare(a.committedAt);
  });

export const resolveDefaultBranch = async (repoRoot: string): Promise<string | null> => {
  try {
    const output = await runGit(
      repoRoot,
      ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"],
      STRICT_GIT_OPTIONS,
    );
    const name = output.trim().replace(/^origin\//, "");
    if (name.length > 0) {
      return name;
    }
  } catch {
    // fall through to local candidates
  }
  for (const candidate of ["main", "master"]) {
    try {
      await runGit(
        repoRoot,
        ["rev-parse", "--verify", "--quiet", `refs/heads/${candidate}`],
        STRICT_GIT_OPTIONS,
      );
      return candidate;
    } catch {
      // try next candidate
    }
  }
  return null;
};

type BranchStats = Pick<
  BranchListEntry,
  "ahead" | "behind" | "fileChanges" | "additions" | "deletions"
>;

const buildEmptyBranchStats = (): BranchStats => ({
  ahead: null,
  behind: null,
  fileChanges: null,
  additions: null,
  deletions: null,
});

export const parseAheadBehindOutput = (value: string): Pick<BranchStats, "ahead" | "behind"> => {
  const [behindRaw, aheadRaw] = value.trim().split(/\s+/);
  const behind = Number.parseInt(behindRaw ?? "", 10);
  const ahead = Number.parseInt(aheadRaw ?? "", 10);
  if (!Number.isInteger(behind) || behind < 0 || !Number.isInteger(ahead) || ahead < 0) {
    return { ahead: null, behind: null };
  }
  return { ahead, behind };
};

export const parseBranchDiffStats = (
  nameStatusOutput: string,
  numstatOutput: string,
): Pick<BranchStats, "fileChanges" | "additions" | "deletions"> => {
  const fileChanges = { add: 0, m: 0, d: 0 };
  nameStatusOutput
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .forEach((line) => {
      const status = line[0];
      if (status === "A") {
        fileChanges.add += 1;
        return;
      }
      if (status === "D") {
        fileChanges.d += 1;
        return;
      }
      fileChanges.m += 1;
    });
  let additions = 0;
  let deletions = 0;
  numstatOutput
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .forEach((line) => {
      const [addRaw, delRaw] = line.split("\t");
      const add = Number.parseInt(addRaw ?? "", 10);
      const del = Number.parseInt(delRaw ?? "", 10);
      if (Number.isInteger(add)) {
        additions += add;
      }
      if (Number.isInteger(del)) {
        deletions += del;
      }
    });
  return { fileChanges, additions, deletions };
};

const resolveBranchStats = async (
  repoRoot: string,
  baseBranch: string,
  branch: string,
): Promise<BranchStats | null> => {
  try {
    const [aheadBehindOutput, nameStatusOutput, numstatOutput] = await Promise.all([
      runGit(repoRoot, ["rev-list", "--left-right", "--count", `${baseBranch}...${branch}`], {
        timeoutMs: 2000,
        maxBuffer: 1_000_000,
        allowStdoutOnError: false,
      }),
      runGit(repoRoot, ["diff", "--name-status", "--find-renames", `${baseBranch}...${branch}`]),
      runGit(repoRoot, ["diff", "--numstat", `${baseBranch}...${branch}`]),
    ]);
    return {
      ...parseAheadBehindOutput(aheadBehindOutput),
      ...parseBranchDiffStats(nameStatusOutput, numstatOutput),
    };
  } catch {
    return null;
  }
};

const resolveBranchStatsCached = async (
  repoRoot: string,
  baseBranch: string,
  ref: ParsedBranchRef,
  baseSha: string | null,
): Promise<BranchStats> => {
  const cacheKey = baseSha && ref.sha ? `${repoRoot}\0${baseSha}\0${ref.sha}` : null;
  if (cacheKey) {
    const cached = statsCache.get(cacheKey);
    if (cached) {
      return cached;
    }
  }
  const stats = await resolveBranchStats(repoRoot, baseBranch, ref.name);
  if (!stats) {
    return buildEmptyBranchStats();
  }
  if (cacheKey) {
    setMapEntryWithLimit(statsCache, cacheKey, stats, STATS_CACHE_MAX_ENTRIES);
  }
  return stats;
};

const buildEmptyBranchList = (): BranchList => ({
  repoRoot: null,
  defaultBranch: null,
  currentBranch: null,
  entries: [],
});

export const clearBranchListCache = (repoRoot: string) => {
  listCache.delete(repoRoot);
};

export const fetchBranchList = async (
  cwd: string | null,
  options?: { force?: boolean },
): Promise<BranchList> => {
  const context = await resolveGitRepoContext(cwd);
  if (context.reason) {
    return buildEmptyBranchList();
  }
  const repoRoot = context.repoRoot;
  const nowMs = Date.now();
  const cached = listCache.get(repoRoot);
  if (
    cached &&
    shouldReuseGitCache({
      force: options?.force,
      cachedAt: cached.at,
      nowMs,
      ttlMs: GIT_CACHE_TTL_MS,
    })
  ) {
    return cached.list;
  }
  try {
    const [refsOutput, worktreeOutput, defaultBranch, prMap] = await Promise.all([
      runGit(repoRoot, [
        "for-each-ref",
        "refs/heads",
        "--format=%(refname:short)%00%(committerdate:iso-strict)%00%(HEAD)%00%(objectname)",
      ]),
      runGit(repoRoot, ["worktree", "list", "--porcelain"]),
      resolveDefaultBranch(repoRoot),
      fetchBranchPrMap(repoRoot),
    ]);
    const refs = parseForEachRefBranches(refsOutput);
    const worktreeByBranch = parseWorktreeBranchMap(worktreeOutput);
    const mergedNames = defaultBranch
      ? parseMergedBranchNames(await runGit(repoRoot, ["branch", "--merged", defaultBranch]))
      : new Set<string>();
    const baseSha = defaultBranch
      ? (refs.find((ref) => ref.name === defaultBranch)?.sha ?? null)
      : null;
    const branches = await mapWithConcurrencyLimit(
      refs,
      8,
      async (ref): Promise<BranchListEntry> => {
        const isDefault = defaultBranch != null && ref.name === defaultBranch;
        const stats =
          isDefault || !defaultBranch
            ? buildEmptyBranchStats()
            : await resolveBranchStatsCached(repoRoot, defaultBranch, ref, baseSha);
        return {
          name: ref.name,
          current: ref.current,
          isDefault,
          ...stats,
          merged: defaultBranch && !isDefault ? mergedNames.has(ref.name) : null,
          pr: prMap ? (prMap.get(ref.name) ?? { state: "none", url: null, number: null }) : null,
          worktreePath: worktreeByBranch.get(ref.name) ?? null,
          committedAt: ref.committedAt,
        };
      },
    );
    const list: BranchList = {
      repoRoot,
      defaultBranch,
      currentBranch: refs.find((ref) => ref.current)?.name ?? null,
      entries: sortBranchEntries(branches),
    };
    setMapEntryWithLimit(listCache, repoRoot, { at: nowMs, list }, LIST_CACHE_MAX_ENTRIES);
    return list;
  } catch {
    return buildEmptyBranchList();
  }
};

export const checkoutBranch = async (cwd: string, branch: string): Promise<void> => {
  try {
    await runGit(cwd, ["checkout", branch], STRICT_GIT_OPTIONS);
  } catch (err) {
    throw toGitCommandError(err, "git checkout failed");
  }
};

export const createBranch = async (cwd: string, name: string, base?: string): Promise<void> => {
  const args = base ? ["checkout", "-b", name, base] : ["checkout", "-b", name];
  try {
    await runGit(cwd, args, STRICT_GIT_OPTIONS);
  } catch (err) {
    throw toGitCommandError(err, "git checkout -b failed");
  }
};

export const deleteBranch = async (
  cwd: string,
  name: string,
  options?: { force?: boolean },
): Promise<void> => {
  try {
    await runGit(cwd, ["branch", options?.force ? "-D" : "-d", name], STRICT_GIT_OPTIONS);
  } catch (err) {
    throw toGitCommandError(err, "git branch delete failed");
  }
};
