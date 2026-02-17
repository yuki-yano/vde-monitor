import { shouldReuseCacheEntry } from "./git-common";
import { resolveRepoRoot, runGit } from "./git-utils";

export type GitQueryUnavailableReason = "cwd_unknown" | "not_git";

export const resolveGitRepoContext = async (cwd: string | null) => {
  if (!cwd) {
    return {
      repoRoot: null as string | null,
      reason: "cwd_unknown" as GitQueryUnavailableReason,
    };
  }
  const repoRoot = await resolveRepoRoot(cwd);
  if (!repoRoot) {
    return {
      repoRoot: null as string | null,
      reason: "not_git" as GitQueryUnavailableReason,
    };
  }
  return {
    repoRoot,
    reason: null as GitQueryUnavailableReason | null,
  };
};

export const resolveGitHead = async (repoRoot: string) => {
  try {
    const output = await runGit(repoRoot, ["rev-parse", "HEAD"]);
    const trimmed = output.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch {
    return null;
  }
};

export const shouldReuseGitCache = ({
  force,
  cachedAt,
  nowMs,
  ttlMs,
}: {
  force: boolean | undefined;
  cachedAt: number;
  nowMs: number;
  ttlMs: number;
}) =>
  shouldReuseCacheEntry({
    force,
    cachedAt,
    nowMs,
    ttlMs,
  });
