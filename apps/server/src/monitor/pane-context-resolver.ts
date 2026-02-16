import type { ResolvedWorktreeStatus } from "./vw-worktree";

type ResolvePaneContextArgs = {
  currentPath: string | null;
  resolveRepoRoot: (currentPath: string | null) => Promise<string | null>;
  resolveWorktreeStatus?: (
    currentPath: string | null,
  ) => ResolvedWorktreeStatus | Promise<ResolvedWorktreeStatus | null> | null;
  resolveBranch?: (currentPath: string | null) => Promise<string | null>;
};

export type PaneResolvedContext = {
  repoRoot: string | null;
  branch: string | null;
  worktreePath: string | null;
  worktreeDirty: boolean | null;
  worktreeLocked: boolean | null;
  worktreeLockOwner: string | null;
  worktreeLockReason: string | null;
  worktreeMerged: boolean | null;
};

const normalizePathForCompare = (value: string | null | undefined) => {
  if (!value) return null;
  const normalized = value.replace(/[\\/]+$/, "");
  return normalized.length > 0 ? normalized : null;
};

const isSamePath = (left: string | null | undefined, right: string | null | undefined) => {
  const normalizedLeft = normalizePathForCompare(left);
  const normalizedRight = normalizePathForCompare(right);
  if (!normalizedLeft || !normalizedRight) {
    return false;
  }
  return normalizedLeft === normalizedRight;
};

export const resolvePaneContext = async ({
  currentPath,
  resolveRepoRoot,
  resolveWorktreeStatus,
  resolveBranch,
}: ResolvePaneContextArgs): Promise<PaneResolvedContext> => {
  const [candidateWorktreeStatus, resolvedRepoRoot] = await Promise.all([
    resolveWorktreeStatus ? resolveWorktreeStatus(currentPath) : Promise.resolve(null),
    resolveRepoRoot(currentPath),
  ]);
  const worktreeStatus =
    candidateWorktreeStatus &&
    (resolvedRepoRoot == null || isSamePath(candidateWorktreeStatus.worktreePath, resolvedRepoRoot))
      ? candidateWorktreeStatus
      : null;
  const repoRoot = worktreeStatus?.repoRoot ?? resolvedRepoRoot;
  const branch = worktreeStatus?.branch ?? (await resolveBranch?.(currentPath)) ?? null;

  return {
    repoRoot,
    branch,
    worktreePath: worktreeStatus?.worktreePath ?? null,
    worktreeDirty: worktreeStatus?.worktreeDirty ?? null,
    worktreeLocked: worktreeStatus?.worktreeLocked ?? null,
    worktreeLockOwner: worktreeStatus?.worktreeLockOwner ?? null,
    worktreeLockReason: worktreeStatus?.worktreeLockReason ?? null,
    worktreeMerged: worktreeStatus?.worktreeMerged ?? null,
  };
};
