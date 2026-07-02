import type { BranchListEntry } from "@vde-monitor/shared";

import {
  buildVisibleFileChangeCategories,
  formatRelativeWorktreePath,
  resolveWorktreePrStatus,
} from "./worktree-view-model";

export const resolveBranchPrStatus = (
  entry: BranchListEntry,
): { label: string; className: string } | null => {
  if (!entry.pr) {
    return null;
  }
  return resolveWorktreePrStatus(entry.pr.state);
};

export const buildBranchFileChangeCategories = (
  fileChanges: BranchListEntry["fileChanges"],
): ReturnType<typeof buildVisibleFileChangeCategories> =>
  buildVisibleFileChangeCategories(fileChanges);

export const resolveBranchWorktreeRelativePath = (
  entry: BranchListEntry,
  repoRoot: string | null,
): string | null => {
  if (!entry.worktreePath) {
    return null;
  }
  const relativePath = formatRelativeWorktreePath(entry.worktreePath, repoRoot);
  return relativePath === "." ? null : relativePath;
};

export const isBranchCheckoutDisabled = (entry: BranchListEntry): boolean =>
  entry.current || entry.worktreePath != null;

export const isBranchDeleteDisabled = (entry: BranchListEntry): boolean =>
  entry.current || entry.isDefault || entry.worktreePath != null;
