import type { WorktreeListEntry } from "@vde-monitor/shared";

type WorktreeFileChangeCounts = { add: number; m: number; d: number };

export const formatGitMetric = (value: number | null) => (value == null ? "—" : String(value));

export const sortWorktreeEntriesByRepoRoot = (
  entries: WorktreeListEntry[],
  worktreeRepoRoot: string | null,
): WorktreeListEntry[] => {
  if (!worktreeRepoRoot) {
    return entries;
  }
  const repoRootEntries: WorktreeListEntry[] = [];
  const restEntries: WorktreeListEntry[] = [];
  entries.forEach((entry) => {
    if (entry.path === worktreeRepoRoot) {
      repoRootEntries.push(entry);
      return;
    }
    restEntries.push(entry);
  });
  return [...repoRootEntries, ...restEntries];
};

export const buildVisibleFileChangeCategories = (
  fileChanges: WorktreeFileChangeCounts | null | undefined,
) =>
  [
    {
      key: "add",
      label: "A",
      value: fileChanges?.add ?? 0,
      className: "text-latte-green-text",
    },
    {
      key: "m",
      label: "M",
      value: fileChanges?.m ?? 0,
      className: "text-latte-yellow-text",
    },
    {
      key: "d",
      label: "D",
      value: fileChanges?.d ?? 0,
      className: "text-latte-red-text",
    },
  ].filter((item) => item.value > 0);

export const formatWorktreeFlag = (value: boolean | null) => {
  if (value == null) {
    return "Unknown";
  }
  return value ? "Yes" : "No";
};

export const hasWorktreeUpstreamDelta = (value: number | null | undefined) =>
  typeof value === "number" && value > 0;

const normalizeSlashPath = (value: string) => {
  const normalized = value.replace(/\\/g, "/").replace(/\/+$/, "");
  if (normalized.length > 0) {
    return normalized;
  }
  return "/";
};

export const formatRelativeWorktreePath = (entryPath: string, repoRoot: string | null) => {
  if (!repoRoot) {
    return entryPath;
  }
  const normalizedEntryPath = normalizeSlashPath(entryPath);
  const normalizedRepoRoot = normalizeSlashPath(repoRoot);
  if (normalizedEntryPath === normalizedRepoRoot) {
    return ".";
  }
  if (normalizedEntryPath.startsWith(`${normalizedRepoRoot}/`)) {
    return normalizedEntryPath.slice(normalizedRepoRoot.length + 1);
  }
  return entryPath;
};

export const resolveWorktreeFlagClassName = (
  kind: "dirty" | "locked" | "merged",
  value: boolean | null,
) => {
  if (value == null) {
    return "border-latte-surface2/70 bg-latte-surface0/60 text-latte-subtext0";
  }
  if (kind === "dirty") {
    return value
      ? "border-latte-red/45 bg-latte-red/10 text-latte-red-text"
      : "border-latte-green/45 bg-latte-green/10 text-latte-green-text";
  }
  if (kind === "locked") {
    return value
      ? "border-latte-yellow/45 bg-latte-yellow/12 text-latte-yellow-text"
      : "border-latte-green/45 bg-latte-green/10 text-latte-green-text";
  }
  return value
    ? "border-latte-green/45 bg-latte-green/10 text-latte-green-text"
    : "border-latte-yellow/45 bg-latte-yellow/12 text-latte-yellow-text";
};

export const resolveWorktreePrStatus = (
  prStatus: WorktreeListEntry["prStatus"] | null | undefined,
): { label: string; className: string } => {
  switch (prStatus) {
    case "none":
      return {
        label: "PR None",
        className: "border-latte-peach/45 bg-latte-peach/12 text-latte-peach-text",
      };
    case "open":
      return {
        label: "PR Open",
        className: "border-latte-blue/45 bg-latte-blue/10 text-latte-blue-text",
      };
    case "merged":
      return {
        label: "PR Merged",
        className: "border-latte-green/45 bg-latte-green/10 text-latte-green-text",
      };
    case "closed_unmerged":
      return {
        label: "PR Closed",
        className: "border-latte-red/45 bg-latte-red/10 text-latte-red-text",
      };
    case "unknown":
    default:
      return {
        label: "PR Unknown",
        className: "border-latte-surface2/70 bg-latte-surface0/60 text-latte-subtext0",
      };
  }
};

export const resolveWorktreePrLinkUrl = (entry: WorktreeListEntry): string | null =>
  entry.prUrl ?? null;
