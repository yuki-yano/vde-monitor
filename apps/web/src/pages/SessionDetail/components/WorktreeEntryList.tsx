import type { WorktreeListEntry } from "@vde-monitor/shared";
import { Check, Github } from "lucide-react";

import { TagPill, TruncatedSegmentText } from "@/components/ui";
import { cn } from "@/lib/cn";

import { formatBranchLabel } from "../sessionDetailUtils";
import {
  buildVisibleFileChangeCategories,
  formatGitMetric,
  formatRelativeWorktreePath,
  formatWorktreeFlag,
  hasWorktreeUpstreamDelta,
  resolveWorktreeFlagClassName,
  resolveWorktreePrLinkUrl,
  resolveWorktreePrStatus,
} from "./worktree-view-model";

type WorktreeEntryListVariant = "section" | "selector";

type WorktreeEntryListProps = {
  entries: WorktreeListEntry[];
  worktreeRepoRoot: string | null;
  worktreeBaseBranch: string | null;
  virtualWorktreePath: string | null;
  actualWorktreePath: string | null;
  onSelectVirtualWorktree?: (path: string) => void;
  onAfterSelect?: () => void;
  variant: WorktreeEntryListVariant;
};

export const WorktreeEntryList = ({
  entries,
  worktreeRepoRoot,
  worktreeBaseBranch,
  virtualWorktreePath,
  actualWorktreePath,
  onSelectVirtualWorktree,
  onAfterSelect,
  variant,
}: WorktreeEntryListProps) => {
  const isSelectorVariant = variant === "selector";
  const pillTextClassName = isSelectorVariant ? "text-[9px]" : "text-[10px]";
  const metricTextClassName = isSelectorVariant ? "text-[10px]" : "text-xs";
  const relativePathClassName = cn(
    "text-latte-subtext0 block truncate font-mono",
    !isSelectorVariant && "text-xs",
  );

  return entries.map((entry) => {
    const isVirtualSelected = entry.path === virtualWorktreePath;
    const isActualPath = entry.path === actualWorktreePath;
    const isRepoRootPath = worktreeRepoRoot != null && entry.path === worktreeRepoRoot;
    const isRepoRootDefaultBranch =
      isRepoRootPath &&
      worktreeBaseBranch != null &&
      entry.branch != null &&
      entry.branch === worktreeBaseBranch;
    const shouldShowMergedFlag = !isRepoRootDefaultBranch;
    const relativePath = formatRelativeWorktreePath(entry.path, worktreeRepoRoot);
    const shouldShowRelativePath = relativePath !== ".";
    const entryVisibleFileChangeCategories = buildVisibleFileChangeCategories(entry.fileChanges);
    const entryAdditionsLabel = formatGitMetric(entry.additions ?? null);
    const entryDeletionsLabel = formatGitMetric(entry.deletions ?? null);
    const hasAhead = hasWorktreeUpstreamDelta(entry.ahead);
    const hasBehind = hasWorktreeUpstreamDelta(entry.behind);
    const shouldShowAheadBehind = !isRepoRootPath && (hasAhead || hasBehind);
    const entryBranchLabel = formatBranchLabel(entry.branch);
    const prStatus = resolveWorktreePrStatus(entry.prStatus ?? null);
    const prLinkUrl = resolveWorktreePrLinkUrl(entry);
    const isEntryDisabled = !onSelectVirtualWorktree && !prLinkUrl;

    return (
      <button
        key={entry.path}
        type="button"
        className={cn(
          "hover:bg-latte-lavender/12 border-latte-surface2/70 flex w-full items-start justify-between gap-2 rounded-lg border px-2 py-1.5 text-left text-xs",
          isVirtualSelected && "bg-latte-lavender/15 border-latte-lavender/50",
        )}
        onClick={() => {
          if (!onSelectVirtualWorktree) {
            return;
          }
          onSelectVirtualWorktree(entry.path);
          onAfterSelect?.();
        }}
        disabled={isEntryDisabled}
      >
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 flex-1 items-center gap-1.5">
            <span className="text-latte-text min-w-0 flex-1 font-mono">
              <TruncatedSegmentText
                text={entryBranchLabel}
                reservePx={8}
                minVisibleSegments={2}
                className="min-w-0 flex-1 text-left"
              />
            </span>
            {prLinkUrl ? (
              <a
                href={prLinkUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Open pull request for ${entryBranchLabel}`}
                title="Open pull request on GitHub"
                className="focus-visible:ring-latte-lavender/30 group relative -m-1.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2"
                onClick={(event) => {
                  event.stopPropagation();
                }}
              >
                <span className="border-latte-surface2/70 text-latte-subtext0 group-hover:border-latte-lavender/60 group-hover:text-latte-text inline-flex h-5 w-5 items-center justify-center rounded-full border transition">
                  <Github className="h-3 w-3" />
                </span>
              </a>
            ) : null}
            <span className="flex shrink-0 items-center gap-1">
              {entryVisibleFileChangeCategories.map((item) => (
                <TagPill
                  key={`${entry.path}:${item.key}`}
                  tone="meta"
                  className={cn(
                    item.className,
                    "px-1.5 py-[2px] font-semibold uppercase tracking-[0.08em]",
                    pillTextClassName,
                  )}
                >
                  {item.label} {item.value}
                </TagPill>
              ))}
              <span className={cn("text-latte-green font-semibold", metricTextClassName)}>
                +{entryAdditionsLabel}
              </span>
              <span className={cn("text-latte-red font-semibold", metricTextClassName)}>
                -{entryDeletionsLabel}
              </span>
            </span>
          </span>
          {isRepoRootPath ? (
            <span className="mt-1 flex items-center gap-1">
              <TagPill
                tone="meta"
                className={cn(
                  "border-latte-blue/45 bg-latte-blue/10 text-latte-blue shrink-0 whitespace-nowrap px-1.5 py-[2px] font-semibold uppercase tracking-[0.08em]",
                  pillTextClassName,
                )}
              >
                Repo Root
              </TagPill>
            </span>
          ) : null}
          {shouldShowRelativePath ? (
            <span className={relativePathClassName} title={entry.path}>
              {relativePath}
            </span>
          ) : null}
          {shouldShowAheadBehind ? (
            <span className="mt-1 flex flex-wrap items-center gap-1">
              {hasAhead ? (
                <span
                  className={cn(
                    "border-latte-green/45 bg-latte-green/10 text-latte-green inline-flex items-center rounded-full border px-1.5 py-0.5 font-mono",
                    pillTextClassName,
                  )}
                >
                  Ahead {entry.ahead}
                </span>
              ) : null}
              {hasBehind ? (
                <span
                  className={cn(
                    "border-latte-yellow/45 bg-latte-yellow/12 text-latte-yellow inline-flex items-center rounded-full border px-1.5 py-0.5 font-mono",
                    pillTextClassName,
                  )}
                >
                  Behind {entry.behind}
                </span>
              ) : null}
            </span>
          ) : null}
          <span className="mt-1 flex flex-wrap items-center gap-1">
            <span
              className={cn(
                "inline-flex items-center rounded-full border px-1.5 py-0.5 font-mono",
                resolveWorktreeFlagClassName("dirty", entry.dirty),
                pillTextClassName,
              )}
            >
              Dirty {formatWorktreeFlag(entry.dirty)}
            </span>
            {!isRepoRootPath ? (
              <span
                className={cn(
                  "inline-flex items-center rounded-full border px-1.5 py-0.5 font-mono",
                  resolveWorktreeFlagClassName("locked", entry.locked),
                  pillTextClassName,
                )}
              >
                Locked {formatWorktreeFlag(entry.locked)}
              </span>
            ) : null}
            {!isRepoRootPath ? (
              <span
                className={cn(
                  "inline-flex items-center rounded-full border px-1.5 py-0.5 font-mono",
                  prStatus.className,
                  pillTextClassName,
                )}
              >
                {prStatus.label}
              </span>
            ) : null}
            {shouldShowMergedFlag ? (
              <span
                className={cn(
                  "inline-flex items-center rounded-full border px-1.5 py-0.5 font-mono",
                  resolveWorktreeFlagClassName("merged", entry.merged),
                  pillTextClassName,
                )}
              >
                Merged {formatWorktreeFlag(entry.merged)}
              </span>
            ) : null}
            {isActualPath ? (
              <span
                className={cn(
                  "border-latte-lavender/45 bg-latte-lavender/10 text-latte-lavender inline-flex items-center rounded-full border px-1.5 py-0.5 font-mono",
                  pillTextClassName,
                )}
              >
                Current
              </span>
            ) : null}
          </span>
        </span>
        {isVirtualSelected ? (
          <Check className="text-latte-lavender mt-0.5 h-3.5 w-3.5 shrink-0" />
        ) : null}
      </button>
    );
  });
};
