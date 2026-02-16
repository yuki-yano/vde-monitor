import type { WorktreeListEntry } from "@vde-monitor/shared";
import { Check, GitBranch, Github, RefreshCw, X } from "lucide-react";
import { useMemo } from "react";

import { Button, Card, IconButton, TagPill, TruncatedSegmentText } from "@/components/ui";

import { formatBranchLabel } from "../sessionDetailUtils";

type WorktreeSectionState = {
  worktreeSelectorEnabled: boolean;
  worktreeSelectorLoading: boolean;
  worktreeSelectorError: string | null;
  worktreeEntries: WorktreeListEntry[];
  worktreeRepoRoot: string | null;
  worktreeBaseBranch: string | null;
  actualWorktreePath: string | null;
  virtualWorktreePath: string | null;
};

type WorktreeSectionActions = {
  onRefreshWorktrees: () => void;
  onSelectVirtualWorktree?: (path: string) => void;
  onClearVirtualWorktree?: () => void;
};

type WorktreeSectionProps = {
  state: WorktreeSectionState;
  actions: WorktreeSectionActions;
};

const formatGitMetric = (value: number | null) => (value == null ? "—" : String(value));

const buildVisibleFileChangeCategories = (
  fileChanges: { add: number; m: number; d: number } | null | undefined,
) =>
  [
    {
      key: "add",
      label: "A",
      value: fileChanges?.add ?? 0,
      className: "text-latte-green",
    },
    {
      key: "m",
      label: "M",
      value: fileChanges?.m ?? 0,
      className: "text-latte-yellow",
    },
    {
      key: "d",
      label: "D",
      value: fileChanges?.d ?? 0,
      className: "text-latte-red",
    },
  ].filter((item) => item.value > 0);

const formatWorktreeFlag = (value: boolean | null) => {
  if (value == null) {
    return "Unknown";
  }
  return value ? "Yes" : "No";
};

const hasWorktreeUpstreamDelta = (value: number | null | undefined) =>
  typeof value === "number" && value > 0;

const normalizeSlashPath = (value: string) => {
  const normalized = value.replace(/\\/g, "/").replace(/\/+$/, "");
  if (normalized.length > 0) {
    return normalized;
  }
  return "/";
};

const formatRelativeWorktreePath = (entryPath: string, repoRoot: string | null) => {
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

const resolveWorktreeFlagClassName = (
  kind: "dirty" | "locked" | "merged",
  value: boolean | null,
) => {
  if (value == null) {
    return "border-latte-surface2/70 bg-latte-surface0/60 text-latte-subtext0";
  }
  if (kind === "dirty") {
    return value
      ? "border-latte-red/45 bg-latte-red/10 text-latte-red"
      : "border-latte-green/45 bg-latte-green/10 text-latte-green";
  }
  if (kind === "locked") {
    return value
      ? "border-latte-yellow/45 bg-latte-yellow/12 text-latte-yellow"
      : "border-latte-green/45 bg-latte-green/10 text-latte-green";
  }
  return value
    ? "border-latte-green/45 bg-latte-green/10 text-latte-green"
    : "border-latte-yellow/45 bg-latte-yellow/12 text-latte-yellow";
};

const resolveWorktreePrStatus = (
  prStatus: WorktreeListEntry["prStatus"] | null | undefined,
): { label: string; className: string } => {
  switch (prStatus) {
    case "none":
      return {
        label: "PR None",
        className: "border-latte-peach/45 bg-latte-peach/12 text-latte-peach",
      };
    case "open":
      return {
        label: "PR Open",
        className: "border-latte-blue/45 bg-latte-blue/10 text-latte-blue",
      };
    case "merged":
      return {
        label: "PR Merged",
        className: "border-latte-green/45 bg-latte-green/10 text-latte-green",
      };
    case "closed_unmerged":
      return {
        label: "PR Closed",
        className: "border-latte-red/45 bg-latte-red/10 text-latte-red",
      };
    default:
      return {
        label: "PR Unknown",
        className: "border-latte-surface2/70 bg-latte-surface0/60 text-latte-subtext0",
      };
  }
};

const resolveWorktreePrLinkUrl = (entry: WorktreeListEntry): string | null => entry.prUrl ?? null;

export const WorktreeSection = ({ state, actions }: WorktreeSectionProps) => {
  const {
    worktreeSelectorEnabled,
    worktreeSelectorLoading,
    worktreeSelectorError,
    worktreeEntries,
    worktreeRepoRoot,
    worktreeBaseBranch,
    actualWorktreePath,
    virtualWorktreePath,
  } = state;
  const { onRefreshWorktrees, onSelectVirtualWorktree, onClearVirtualWorktree } = actions;
  const isVirtualActive =
    virtualWorktreePath != null &&
    actualWorktreePath != null &&
    virtualWorktreePath !== actualWorktreePath;

  const displayedWorktreeEntries = useMemo(() => {
    if (!worktreeRepoRoot) {
      return worktreeEntries;
    }
    const repoRootEntries: WorktreeListEntry[] = [];
    const restEntries: WorktreeListEntry[] = [];
    worktreeEntries.forEach((entry) => {
      if (entry.path === worktreeRepoRoot) {
        repoRootEntries.push(entry);
        return;
      }
      restEntries.push(entry);
    });
    return [...repoRootEntries, ...restEntries];
  }, [worktreeEntries, worktreeRepoRoot]);
  const showBlockingWorktreeLoading = worktreeSelectorLoading && worktreeEntries.length === 0;

  if (!worktreeSelectorEnabled) {
    return (
      <Card className="p-3 sm:p-4" data-testid="worktree-section">
        <div className="flex items-center gap-1.5">
          <GitBranch className="text-latte-subtext0 h-4 w-4 shrink-0" />
          <span className="text-latte-text text-sm font-semibold">Worktrees</span>
        </div>
        <p className="text-latte-subtext0 mt-2 text-xs">
          Worktree selector is not available for this session.
        </p>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col gap-2" data-testid="worktree-section">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-latte-text text-base font-semibold tracking-tight">
            Worktrees
          </h2>
          <p className="text-latte-subtext0 min-w-0 overflow-hidden text-sm">
            {displayedWorktreeEntries.length} worktrees
            {isVirtualActive ? " · Virtual active" : ""}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="text-latte-subtext0 hover:text-latte-text h-[30px] w-[30px] shrink-0 self-start p-0"
          onClick={onRefreshWorktrees}
          disabled={worktreeSelectorLoading}
          aria-label="Refresh worktrees"
        >
          <RefreshCw className="h-4 w-4" />
          <span className="sr-only">Refresh</span>
        </Button>
      </div>
      {isVirtualActive ? (
        <div className="-mt-1 flex justify-end">
          <IconButton
            type="button"
            size="xs"
            variant="dangerOutline"
            aria-label="Clear virtual worktree"
            title="Clear virtual worktree"
            className="shrink-0"
            onClick={onClearVirtualWorktree}
          >
            <X className="h-3 w-3" />
          </IconButton>
        </div>
      ) : null}

      {showBlockingWorktreeLoading ? (
        <p className="text-latte-subtext0 px-1 py-2 text-xs">Loading worktrees...</p>
      ) : null}
      {worktreeSelectorError ? (
        <p className="text-latte-red px-1 py-2 text-xs">{worktreeSelectorError}</p>
      ) : null}
      {!showBlockingWorktreeLoading && !worktreeSelectorError && worktreeEntries.length === 0 ? (
        <p className="text-latte-subtext0 px-1 py-2 text-xs">No worktrees available.</p>
      ) : null}
      {!showBlockingWorktreeLoading && !worktreeSelectorError ? (
        <div className="custom-scrollbar max-h-[360px] space-y-1 overflow-y-auto pr-0.5">
          {displayedWorktreeEntries.map((entry) => {
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
            const entryVisibleFileChangeCategories = buildVisibleFileChangeCategories(
              entry.fileChanges,
            );
            const entryAdditionsLabel = formatGitMetric(entry.additions ?? null);
            const entryDeletionsLabel = formatGitMetric(entry.deletions ?? null);
            const hasAhead = hasWorktreeUpstreamDelta(entry.ahead);
            const hasBehind = hasWorktreeUpstreamDelta(entry.behind);
            const shouldShowAheadBehind = !isRepoRootPath && (hasAhead || hasBehind);
            const entryBranchLabel = formatBranchLabel(entry.branch);
            const prStatus = resolveWorktreePrStatus(entry.prStatus ?? null);
            const prLinkUrl = resolveWorktreePrLinkUrl(entry);

            return (
              <button
                key={entry.path}
                type="button"
                className={`hover:bg-latte-lavender/12 border-latte-surface2/70 flex w-full items-start justify-between gap-2 rounded-lg border px-2 py-1.5 text-left text-xs ${
                  isVirtualSelected ? "bg-latte-lavender/15 border-latte-lavender/50" : ""
                }`}
                onClick={() => {
                  if (!onSelectVirtualWorktree) {
                    return;
                  }
                  onSelectVirtualWorktree(entry.path);
                }}
                disabled={!onSelectVirtualWorktree}
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
                    {isRepoRootPath ? (
                      <TagPill
                        tone="meta"
                        className="border-latte-blue/45 bg-latte-blue/10 text-latte-blue shrink-0 whitespace-nowrap px-1.5 py-[2px] text-[10px] font-semibold uppercase tracking-[0.08em]"
                      >
                        Repo Root
                      </TagPill>
                    ) : null}
                    {prLinkUrl ? (
                      <a
                        href={prLinkUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Open pull request for ${entryBranchLabel}`}
                        title="Open pull request on GitHub"
                        className="border-latte-surface2/70 text-latte-subtext0 hover:border-latte-lavender/60 hover:text-latte-text inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition"
                        onClick={(event) => {
                          event.stopPropagation();
                        }}
                      >
                        <Github className="h-3 w-3" />
                      </a>
                    ) : null}
                    <span className="flex shrink-0 items-center gap-1">
                      {entryVisibleFileChangeCategories.map((item) => (
                        <TagPill
                          key={`${entry.path}:${item.key}`}
                          tone="meta"
                          className={`${item.className} px-1.5 py-[2px] text-[10px] font-semibold uppercase tracking-[0.08em]`}
                        >
                          {item.label} {item.value}
                        </TagPill>
                      ))}
                      <span className="text-latte-green text-xs font-semibold">
                        +{entryAdditionsLabel}
                      </span>
                      <span className="text-latte-red text-xs font-semibold">
                        -{entryDeletionsLabel}
                      </span>
                    </span>
                  </span>
                  {shouldShowRelativePath ? (
                    <span
                      className="text-latte-subtext0 block truncate font-mono text-xs"
                      title={entry.path}
                    >
                      {relativePath}
                    </span>
                  ) : null}
                  {shouldShowAheadBehind ? (
                    <span className="mt-1 flex flex-wrap items-center gap-1">
                      {hasAhead ? (
                        <span className="border-latte-green/45 bg-latte-green/10 text-latte-green inline-flex items-center rounded-full border px-1.5 py-0.5 font-mono text-[10px]">
                          Ahead {entry.ahead}
                        </span>
                      ) : null}
                      {hasBehind ? (
                        <span className="border-latte-yellow/45 bg-latte-yellow/12 text-latte-yellow inline-flex items-center rounded-full border px-1.5 py-0.5 font-mono text-[10px]">
                          Behind {entry.behind}
                        </span>
                      ) : null}
                    </span>
                  ) : null}
                  <span className="mt-1 flex flex-wrap items-center gap-1">
                    <span
                      className={`inline-flex items-center rounded-full border px-1.5 py-0.5 font-mono text-[10px] ${resolveWorktreeFlagClassName("dirty", entry.dirty)}`}
                    >
                      Dirty {formatWorktreeFlag(entry.dirty)}
                    </span>
                    {!isRepoRootPath ? (
                      <span
                        className={`inline-flex items-center rounded-full border px-1.5 py-0.5 font-mono text-[10px] ${resolveWorktreeFlagClassName("locked", entry.locked)}`}
                      >
                        Locked {formatWorktreeFlag(entry.locked)}
                      </span>
                    ) : null}
                    {!isRepoRootPath ? (
                      <span
                        className={`inline-flex items-center rounded-full border px-1.5 py-0.5 font-mono text-[10px] ${prStatus.className}`}
                      >
                        {prStatus.label}
                      </span>
                    ) : null}
                    {shouldShowMergedFlag ? (
                      <span
                        className={`inline-flex items-center rounded-full border px-1.5 py-0.5 font-mono text-[10px] ${resolveWorktreeFlagClassName("merged", entry.merged)}`}
                      >
                        Merged {formatWorktreeFlag(entry.merged)}
                      </span>
                    ) : null}
                    {isActualPath ? (
                      <span className="border-latte-lavender/45 bg-latte-lavender/10 text-latte-lavender inline-flex items-center rounded-full border px-1.5 py-0.5 font-mono text-[10px]">
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
          })}
        </div>
      ) : null}
    </Card>
  );
};
