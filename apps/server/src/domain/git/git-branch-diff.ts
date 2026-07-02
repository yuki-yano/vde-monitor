import crypto from "node:crypto";

import type { DiffFile, DiffSummary, DiffSummaryFile } from "@vde-monitor/shared";

import { setMapEntryWithLimit } from "../../cache";
import { nowIso } from "../../utils/time";
import { resolveDefaultBranch } from "./git-branches";
import { GIT_CACHE_TTL_MS, GIT_PATCH_MAX_BYTES, truncateTextByLength } from "./git-common";
import { isBinaryPatch, parseNumstat, parseNumstatLine, pickStatus } from "./git-parsers";
import { resolveGitRepoContext, shouldReuseGitCache } from "./git-query-context";
import { runGit } from "./git-utils";

const SUMMARY_CACHE_MAX_ENTRIES = 100;
const FILE_CACHE_MAX_ENTRIES = 300;

const summaryCache = new Map<string, { at: number; summary: DiffSummary }>();
const fileCache = new Map<string, { at: number; file: DiffFile }>();

export type BranchDiffScope = {
  repoRoot: string;
  baseBranch: string;
  branch: string;
};

export type ResolveBranchDiffScopeResult =
  | { ok: true; scope: BranchDiffScope }
  | { ok: false; reason: "not_git" | "default_branch_unavailable" | "unknown_branch" };

export const resolveBranchDiffScope = async (
  cwd: string | null,
  branch: string,
): Promise<ResolveBranchDiffScopeResult> => {
  const context = await resolveGitRepoContext(cwd);
  if (context.reason) {
    return { ok: false, reason: "not_git" };
  }
  const repoRoot = context.repoRoot;
  const baseBranch = await resolveDefaultBranch(repoRoot);
  if (!baseBranch) {
    return { ok: false, reason: "default_branch_unavailable" };
  }
  try {
    await runGit(repoRoot, ["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`], {
      allowStdoutOnError: false,
    });
  } catch {
    return { ok: false, reason: "unknown_branch" };
  }
  return { ok: true, scope: { repoRoot, baseBranch, branch } };
};

export const parseBranchNameStatus = (output: string): DiffSummaryFile[] => {
  const tokens = output.split("\0").filter((token) => token.length > 0);
  const files: DiffSummaryFile[] = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const statusToken = tokens[i] ?? "";
    const statusChar = statusToken[0] ?? "";
    if (!/^[A-Z]/.test(statusChar)) {
      continue;
    }
    const isRename = statusChar === "R" || statusChar === "C";
    if (isRename) {
      const from = tokens[i + 1];
      const to = tokens[i + 2];
      i += 2;
      if (!from || !to) {
        continue;
      }
      files.push({ path: to, status: pickStatus(statusChar), staged: false, renamedFrom: from });
      continue;
    }
    const filePath = tokens[i + 1];
    i += 1;
    if (!filePath) {
      continue;
    }
    files.push({
      path: filePath,
      status: pickStatus(statusChar),
      staged: false,
      renamedFrom: undefined,
    });
  }
  return files;
};

const resolveBranchDiffRev = async (scope: BranchDiffScope): Promise<string | null> => {
  try {
    const [mergeBase, tip] = await Promise.all([
      runGit(scope.repoRoot, ["merge-base", scope.baseBranch, scope.branch], {
        allowStdoutOnError: false,
      }),
      runGit(scope.repoRoot, ["rev-parse", scope.branch], { allowStdoutOnError: false }),
    ]);
    return crypto.createHash("sha1").update(`${mergeBase.trim()}:${tip.trim()}`).digest("hex");
  } catch {
    return null;
  }
};

const buildScopeCacheKey = (scope: BranchDiffScope) =>
  `${scope.repoRoot}:${scope.baseBranch}:${scope.branch}`;

export const clearBranchDiffCachesForRepo = (repoRoot: string) => {
  const prefix = `${repoRoot}:`;
  for (const key of summaryCache.keys()) {
    if (key.startsWith(prefix)) {
      summaryCache.delete(key);
    }
  }
  for (const key of fileCache.keys()) {
    if (key.startsWith(prefix)) {
      fileCache.delete(key);
    }
  }
};

export const fetchBranchDiffSummary = async (
  scope: BranchDiffScope,
  options?: { force?: boolean },
): Promise<DiffSummary> => {
  const cacheKey = buildScopeCacheKey(scope);
  const nowMs = Date.now();
  const cached = summaryCache.get(cacheKey);
  if (
    cached &&
    shouldReuseGitCache({
      force: options?.force,
      cachedAt: cached.at,
      nowMs,
      ttlMs: GIT_CACHE_TTL_MS,
    })
  ) {
    return cached.summary;
  }
  const range = `${scope.baseBranch}...${scope.branch}`;
  try {
    const [rev, nameStatusOutput, numstatOutput] = await Promise.all([
      resolveBranchDiffRev(scope),
      runGit(scope.repoRoot, ["diff", "--name-status", "-z", "--find-renames", range]),
      runGit(scope.repoRoot, ["diff", "--numstat", range]),
    ]);
    const files = parseBranchNameStatus(nameStatusOutput);
    const stats = parseNumstat(numstatOutput);
    const withStats = files.map((file) => ({
      ...file,
      additions: stats.get(file.path)?.additions ?? null,
      deletions: stats.get(file.path)?.deletions ?? null,
    }));
    const summary: DiffSummary = {
      repoRoot: scope.repoRoot,
      rev,
      generatedAt: nowIso(),
      files: withStats,
    };
    setMapEntryWithLimit(summaryCache, cacheKey, { at: nowMs, summary }, SUMMARY_CACHE_MAX_ENTRIES);
    return summary;
  } catch {
    return {
      repoRoot: scope.repoRoot,
      rev: null,
      generatedAt: nowIso(),
      files: [],
      reason: "error",
    };
  }
};

export const fetchBranchDiffFile = async (
  scope: BranchDiffScope,
  file: DiffSummaryFile,
  rev: string,
  options?: { force?: boolean },
): Promise<DiffFile> => {
  const cacheKey = `${buildScopeCacheKey(scope)}:${file.path}:${rev}`;
  const nowMs = Date.now();
  const cached = fileCache.get(cacheKey);
  if (
    cached &&
    shouldReuseGitCache({
      force: options?.force,
      cachedAt: cached.at,
      nowMs,
      ttlMs: GIT_CACHE_TTL_MS,
    })
  ) {
    return cached.file;
  }
  const range = `${scope.baseBranch}...${scope.branch}`;
  const pathArgs = file.renamedFrom ? [file.renamedFrom, file.path] : [file.path];
  let patch = "";
  let numstat: ReturnType<typeof parseNumstatLine> = null;
  try {
    const [patchOutput, numstatOutput] = await Promise.all([
      runGit(scope.repoRoot, ["diff", "--find-renames", range, "--", ...pathArgs]),
      runGit(scope.repoRoot, ["diff", "--numstat", range, "--", ...pathArgs]),
    ]);
    patch = patchOutput;
    numstat = parseNumstatLine(numstatOutput);
  } catch {
    patch = "";
  }
  const truncatedPatch = truncateTextByLength({ text: patch, maxLength: GIT_PATCH_MAX_BYTES });
  const binary = isBinaryPatch(patch) || numstat?.additions == null || numstat?.deletions == null;
  const diffFile: DiffFile = {
    path: file.path,
    status: file.status,
    patch: truncatedPatch.text.length > 0 ? truncatedPatch.text : null,
    binary,
    truncated: truncatedPatch.truncated,
    rev,
  };
  setMapEntryWithLimit(fileCache, cacheKey, { at: nowMs, file: diffFile }, FILE_CACHE_MAX_ENTRIES);
  return diffFile;
};
