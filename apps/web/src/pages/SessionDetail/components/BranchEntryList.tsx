import type { BranchListEntry } from "@vde-monitor/shared";
import { Check, Github, Trash2 } from "lucide-react";

import { Button, IconButton, TagPill, TruncatedSegmentText } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatRelativeTime } from "@/lib/session-format";

import {
  buildBranchFileChangeCategories,
  isBranchCheckoutDisabled,
  isBranchDeleteDisabled,
  resolveBranchPrStatus,
  resolveBranchWorktreeRelativePath,
} from "./branch-view-model";
import { formatGitMetric, resolveWorktreeFlagClassName } from "./worktree-view-model";

type BranchEntryListProps = {
  entries: BranchListEntry[];
  repoRoot: string | null;
  virtualBranch: string | null;
  mutatingBranch: string | null;
  nowMs: number;
  onSelectVirtualBranch: (name: string) => void;
  onRequestCheckoutBranch: (entry: BranchListEntry) => void;
  onRequestDeleteBranch: (entry: BranchListEntry) => void;
};

export const BranchEntryList = ({
  entries,
  repoRoot,
  virtualBranch,
  mutatingBranch,
  nowMs,
  onSelectVirtualBranch,
  onRequestCheckoutBranch,
  onRequestDeleteBranch,
}: BranchEntryListProps) => {
  return entries.map((entry) => {
    const isVirtualSelected = entry.name === virtualBranch;
    const prStatus = resolveBranchPrStatus(entry);
    const prLinkUrl = entry.pr?.url ?? null;
    const fileChangeCategories = buildBranchFileChangeCategories(entry.fileChanges);
    const relativeWorktreePath = resolveBranchWorktreeRelativePath(entry, repoRoot);
    const hasAhead = typeof entry.ahead === "number" && entry.ahead > 0;
    const hasBehind = typeof entry.behind === "number" && entry.behind > 0;
    const committedAtLabel = formatRelativeTime(entry.committedAt, nowMs);
    const isMutating = mutatingBranch === entry.name;

    return (
      <div
        key={entry.name}
        className={cn(
          "hover:bg-latte-lavender/12 border-latte-surface2/70 flex w-full items-start justify-between gap-2 rounded-lg border px-2 py-1.5 text-left text-xs",
          isVirtualSelected && "bg-latte-lavender/15 border-latte-lavender/50",
        )}
      >
        <button
          type="button"
          className="min-w-0 flex-1 text-left"
          onClick={() => onSelectVirtualBranch(entry.name)}
        >
          <span className="flex min-w-0 flex-1 items-center gap-1.5">
            <span className="text-latte-text min-w-0 flex-1 font-mono">
              <TruncatedSegmentText
                text={entry.name}
                reservePx={8}
                minVisibleSegments={2}
                className="min-w-0 flex-1 text-left"
              />
            </span>
            {!entry.isDefault ? (
              <span className="flex shrink-0 items-center gap-1">
                {fileChangeCategories.map((item) => (
                  <TagPill
                    key={`${entry.name}:${item.key}`}
                    tone="meta"
                    className={cn(
                      item.className,
                      "px-1.5 py-[2px] text-[10px] font-semibold uppercase tracking-[0.08em]",
                    )}
                  >
                    {item.label} {item.value}
                  </TagPill>
                ))}
                <span className="text-latte-green text-xs font-semibold">
                  +{formatGitMetric(entry.additions)}
                </span>
                <span className="text-latte-red text-xs font-semibold">
                  -{formatGitMetric(entry.deletions)}
                </span>
              </span>
            ) : null}
          </span>
          {relativeWorktreePath ? (
            <span
              className="text-latte-subtext0 block truncate font-mono text-xs"
              title={entry.worktreePath ?? undefined}
            >
              {relativeWorktreePath}
            </span>
          ) : null}
          {hasAhead || hasBehind ? (
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
            {entry.isDefault ? (
              <span className="border-latte-blue/45 bg-latte-blue/10 text-latte-blue inline-flex items-center rounded-full border px-1.5 py-0.5 font-mono text-[10px]">
                Default
              </span>
            ) : null}
            {entry.current ? (
              <span className="border-latte-lavender/45 bg-latte-lavender/10 text-latte-lavender inline-flex items-center rounded-full border px-1.5 py-0.5 font-mono text-[10px]">
                Current
              </span>
            ) : null}
            {entry.worktreePath != null && !entry.current ? (
              <span className="border-latte-peach/45 bg-latte-peach/12 text-latte-peach inline-flex items-center rounded-full border px-1.5 py-0.5 font-mono text-[10px]">
                Worktree
              </span>
            ) : null}
            {prStatus && !entry.isDefault ? (
              <span
                className={cn(
                  "inline-flex items-center rounded-full border px-1.5 py-0.5 font-mono text-[10px]",
                  prStatus.className,
                )}
              >
                {prStatus.label}
              </span>
            ) : null}
            {!entry.isDefault && entry.merged != null ? (
              <span
                className={cn(
                  "inline-flex items-center rounded-full border px-1.5 py-0.5 font-mono text-[10px]",
                  resolveWorktreeFlagClassName("merged", entry.merged),
                )}
              >
                Merged {entry.merged ? "Yes" : "No"}
              </span>
            ) : null}
            {committedAtLabel ? (
              <span className="text-latte-subtext0 font-mono text-[10px]">{committedAtLabel}</span>
            ) : null}
          </span>
        </button>
        {prLinkUrl ? (
          <a
            href={prLinkUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Open pull request for ${entry.name}`}
            title="Open pull request on GitHub"
            className="focus-visible:ring-latte-lavender/30 group relative -m-1.5 mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center self-start rounded-full focus-visible:outline-hidden focus-visible:ring-2"
          >
            <span className="border-latte-surface2/70 text-latte-subtext0 group-hover:border-latte-lavender/60 group-hover:text-latte-text inline-flex h-5 w-5 items-center justify-center rounded-full border transition">
              <Github className="h-3 w-3" />
            </span>
          </a>
        ) : null}
        <span className="flex shrink-0 items-center gap-1 self-start">
          {isVirtualSelected ? (
            <Check className="text-latte-lavender mt-0.5 h-3.5 w-3.5 shrink-0" />
          ) : null}
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-1.5 text-[10px]"
            disabled={isBranchCheckoutDisabled(entry) || isMutating}
            onClick={() => onRequestCheckoutBranch(entry)}
          >
            Checkout
          </Button>
          <IconButton
            type="button"
            size="xs"
            variant="dangerOutline"
            aria-label={`Delete branch ${entry.name}`}
            title="Delete branch"
            disabled={isBranchDeleteDisabled(entry) || isMutating}
            onClick={() => onRequestDeleteBranch(entry)}
          >
            <Trash2 className="h-3 w-3" />
          </IconButton>
        </span>
      </div>
    );
  });
};
