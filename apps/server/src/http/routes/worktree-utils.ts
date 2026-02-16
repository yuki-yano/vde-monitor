import path from "node:path";

import type { SessionDetail, WorktreeList, WorktreeListEntry } from "@vde-monitor/shared";

import { fetchDiffSummary } from "../../git-diff";
import { runGit } from "../../git-utils";
import { resolveRepoBranchCached } from "../../monitor/repo-branch";
import { resolveVwWorktreeSnapshotCached } from "../../monitor/vw-worktree";

type WorktreeListPayload = WorktreeList;
type WorktreePathValidationPayload = Pick<WorktreeListPayload, "entries">;

type WorktreeSource = Pick<SessionDetail, "repoRoot" | "currentPath">;
type WorktreeListEntryBase = Omit<WorktreeListEntry, "fileChanges" | "additions" | "deletions">;
type WorktreeDiffStats = Pick<WorktreeListEntry, "fileChanges" | "additions" | "deletions">;
type WorktreeAheadBehindStats = Pick<WorktreeListEntry, "ahead" | "behind">;
type DiffSummaryResult = Awaited<ReturnType<typeof fetchDiffSummary>>;

const normalizePath = (value: string | null | undefined): string | null => {
  if (!value) {
    return null;
  }
  const resolved = path.resolve(value);
  const normalized = resolved.replace(/[\\/]+$/, "");
  if (normalized.length > 0) {
    return normalized;
  }
  return path.sep;
};

const resolveSnapshotCwd = (detail: WorktreeSource) =>
  detail.repoRoot ?? detail.currentPath ?? process.cwd();

const buildRootFallbackEntry = (rootPath: string): WorktreeListEntryBase => ({
  path: rootPath,
  branch: null,
  dirty: null,
  locked: null,
  lockOwner: null,
  lockReason: null,
  merged: null,
  prStatus: null,
  ahead: null,
  behind: null,
});

const toEntry = (
  entry: NonNullable<
    Awaited<ReturnType<typeof resolveVwWorktreeSnapshotCached>>
  >["entries"][number],
): WorktreeListEntryBase => ({
  path: entry.path,
  branch: entry.branch,
  dirty: entry.dirty,
  locked: entry.locked.value,
  lockOwner: entry.locked.owner,
  lockReason: entry.locked.reason,
  merged: entry.merged.overall,
  prStatus: entry.pr.status,
  ahead: null,
  behind: null,
});

const buildEmptyDiffStats = (): WorktreeDiffStats => ({
  fileChanges: null,
  additions: null,
  deletions: null,
});

const buildEmptyAheadBehindStats = (): WorktreeAheadBehindStats => ({
  ahead: null,
  behind: null,
});

const parseAheadBehindOutput = (value: string): WorktreeAheadBehindStats => {
  const [behindRaw, aheadRaw] = value.trim().split(/\s+/);
  const behind = Number.parseInt(behindRaw ?? "", 10);
  const ahead = Number.parseInt(aheadRaw ?? "", 10);
  if (!Number.isInteger(behind) || behind < 0 || !Number.isInteger(ahead) || ahead < 0) {
    return buildEmptyAheadBehindStats();
  }
  return { ahead, behind };
};

const resolveDiffStats = (summary: DiffSummaryResult): WorktreeDiffStats => {
  if (summary.reason) {
    return buildEmptyDiffStats();
  }
  const fileChanges = summary.files.reduce(
    (counts, file) => {
      if (file.status === "A") {
        counts.add += 1;
        return counts;
      }
      if (file.status === "?") {
        counts.add += 1;
        return counts;
      }
      if (file.status === "D") {
        counts.d += 1;
        return counts;
      }
      counts.m += 1;
      return counts;
    },
    { add: 0, m: 0, d: 0 },
  );
  if (summary.files.length === 0) {
    return {
      fileChanges,
      additions: 0,
      deletions: 0,
    };
  }
  let additions = 0;
  let deletions = 0;
  let hasTotals = false;
  summary.files.forEach((file) => {
    if (typeof file.additions === "number") {
      additions += file.additions;
      hasTotals = true;
    }
    if (typeof file.deletions === "number") {
      deletions += file.deletions;
      hasTotals = true;
    }
  });
  if (!hasTotals) {
    return {
      fileChanges,
      additions: null,
      deletions: null,
    };
  }
  return {
    fileChanges,
    additions,
    deletions,
  };
};

const resolveDiffStatsByWorktreePath = async (entries: WorktreeListEntryBase[]) => {
  const resolved = await Promise.all(
    entries.map(async (entry) => {
      try {
        const summary = await fetchDiffSummary(entry.path);
        return [entry.path, resolveDiffStats(summary)] as const;
      } catch {
        return [entry.path, buildEmptyDiffStats()] as const;
      }
    }),
  );
  return new Map(resolved);
};

const resolveAheadBehindByWorktreePath = async (
  entries: WorktreeListEntryBase[],
  options: { baseBranch: string | null; repoRoot: string | null },
) => {
  const { baseBranch, repoRoot } = options;
  const resolved = await Promise.all(
    entries.map(async (entry) => {
      if (!baseBranch || (repoRoot != null && entry.path === repoRoot)) {
        return [entry.path, buildEmptyAheadBehindStats()] as const;
      }
      try {
        const output = await runGit(
          entry.path,
          ["rev-list", "--left-right", "--count", `${baseBranch}...HEAD`],
          {
            timeoutMs: 2000,
            maxBuffer: 1_000_000,
            allowStdoutOnError: false,
          },
        );
        return [entry.path, parseAheadBehindOutput(output)] as const;
      } catch {
        return [entry.path, buildEmptyAheadBehindStats()] as const;
      }
    }),
  );
  return new Map(resolved);
};

const resolveSnapshotEntries = (
  snapshot: NonNullable<Awaited<ReturnType<typeof resolveVwWorktreeSnapshotCached>>>,
  repoRoot: string | null,
) => {
  const entries = snapshot.entries.map(toEntry);
  const pathSet = new Set(entries.map((entry) => entry.path));
  if (repoRoot && !pathSet.has(repoRoot)) {
    entries.push(buildRootFallbackEntry(repoRoot));
  }
  return entries;
};

export const resolveWorktreePathValidationPayload = async (
  detail: WorktreeSource,
): Promise<WorktreePathValidationPayload> => {
  const snapshot = await resolveVwWorktreeSnapshotCached(resolveSnapshotCwd(detail), {
    ghMode: "never",
  });
  const repoRoot = normalizePath(snapshot?.repoRoot ?? detail.repoRoot);
  if (!snapshot) {
    return {
      entries: [],
    };
  }
  return {
    entries: resolveSnapshotEntries(snapshot, repoRoot),
  };
};

export const resolveWorktreeListPayload = async (
  detail: WorktreeSource,
): Promise<WorktreeListPayload> => {
  const snapshot = await resolveVwWorktreeSnapshotCached(resolveSnapshotCwd(detail), {
    ghMode: "auto",
  });
  const repoRoot = normalizePath(snapshot?.repoRoot ?? detail.repoRoot);
  const currentPath = normalizePath(detail.currentPath);

  if (!snapshot) {
    return {
      repoRoot,
      currentPath,
      baseBranch: null,
      entries: [],
    };
  }

  const baseEntries = resolveSnapshotEntries(snapshot, repoRoot);
  const baseBranch = snapshot.baseBranch ?? null;
  const repoRootBranch = repoRoot ? await resolveRepoBranchCached(repoRoot) : null;
  const diffStatsByPath = await resolveDiffStatsByWorktreePath(baseEntries);
  const aheadBehindByPath = await resolveAheadBehindByWorktreePath(baseEntries, {
    baseBranch,
    repoRoot,
  });
  const entries = baseEntries.map((entry) => ({
    ...entry,
    branch: repoRoot && entry.path === repoRoot ? (repoRootBranch ?? entry.branch) : entry.branch,
    ...(aheadBehindByPath.get(entry.path) ?? buildEmptyAheadBehindStats()),
    ...(diffStatsByPath.get(entry.path) ?? buildEmptyDiffStats()),
  }));

  return {
    repoRoot,
    currentPath,
    baseBranch,
    entries,
  };
};

export const resolveValidWorktreePath = (
  payload: WorktreePathValidationPayload,
  rawPath: string,
): string | null => {
  const normalized = normalizePath(rawPath);
  if (!normalized) {
    return null;
  }
  const exists = payload.entries.some((entry) => entry.path === normalized);
  if (!exists) {
    return null;
  }
  return normalized;
};
