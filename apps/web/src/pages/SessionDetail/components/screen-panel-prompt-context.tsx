import type { WorktreeListEntry } from "@vde-monitor/shared";
import { ChevronsUpDown, GitBranch, X } from "lucide-react";
import type { RefObject } from "react";

import { IconButton, TagPill } from "@/components/ui";
import { cn } from "@/lib/cn";

import { ScreenPanelWorktreeSelectorPanel } from "./ScreenPanelWorktreeSelectorPanel";

type FileChangeCategory = {
  key: string;
  label: string;
  value: number;
  className: string;
};

type PollingPauseMeta = {
  label: string;
  className: string;
};

type ScreenPanelPromptContextProps = {
  promptGitContext: {
    branch: string | null;
    fileChanges: {
      add: number;
      m: number;
      d: number;
    } | null;
    additions: number | null;
    deletions: number | null;
  } | null;
  contextLeftLabel: string | null;
  isContextInStatusRow: boolean;
  displayGitBranchLabel: string;
  gitBranchLabel: string | null;
  isVirtualActive: boolean;
  visibleFileChangeCategories: FileChangeCategory[];
  gitAdditionsLabel: string;
  gitDeletionsLabel: string;
  worktreeSelectorEnabled: boolean;
  worktreeSelectorLoading: boolean;
  worktreeSelectorError: string | null;
  displayedWorktreeEntries: WorktreeListEntry[];
  worktreeRepoRoot: string | null;
  worktreeBaseBranch: string | null;
  actualWorktreePath: string | null;
  virtualWorktreePath: string | null;
  isWorktreeSelectorOpen: boolean;
  branchLabelSlotClassName: string;
  branchTriggerWidthClassName: string;
  branchContainerClassName: string;
  promptGitContextRowRef: RefObject<HTMLDivElement | null>;
  promptGitContextLeftRef: RefObject<HTMLDivElement | null>;
  contextLabelMeasureRef: RefObject<HTMLSpanElement | null>;
  branchPillContainerRef: RefObject<HTMLDivElement | null>;
  branchLabelMeasureRef: RefObject<HTMLSpanElement | null>;
  pollingPauseMeta: PollingPauseMeta | null;
  onRefresh: () => void;
  onRefreshWorktrees?: () => void;
  onSelectVirtualWorktree?: (path: string) => void;
  onClearVirtualWorktree?: () => void;
  onToggleWorktreeSelector: () => void;
  onCloseWorktreeSelector: () => void;
};

const LEADING_TRUNCATE_CLASS_NAME =
  "block w-full min-w-0 overflow-hidden whitespace-nowrap text-left font-mono";

export const ScreenPanelPromptContext = ({
  promptGitContext,
  contextLeftLabel,
  isContextInStatusRow,
  displayGitBranchLabel,
  gitBranchLabel,
  isVirtualActive,
  visibleFileChangeCategories,
  gitAdditionsLabel,
  gitDeletionsLabel,
  worktreeSelectorEnabled,
  worktreeSelectorLoading,
  worktreeSelectorError,
  displayedWorktreeEntries,
  worktreeRepoRoot,
  worktreeBaseBranch,
  actualWorktreePath,
  virtualWorktreePath,
  isWorktreeSelectorOpen,
  branchLabelSlotClassName,
  branchTriggerWidthClassName,
  branchContainerClassName,
  promptGitContextRowRef,
  promptGitContextLeftRef,
  contextLabelMeasureRef,
  branchPillContainerRef,
  branchLabelMeasureRef,
  pollingPauseMeta,
  onRefresh,
  onRefreshWorktrees,
  onSelectVirtualWorktree,
  onClearVirtualWorktree,
  onToggleWorktreeSelector,
  onCloseWorktreeSelector,
}: ScreenPanelPromptContextProps) => (
  <>
    {contextLeftLabel ? (
      <span
        ref={contextLabelMeasureRef}
        aria-hidden="true"
        className="pointer-events-none fixed -left-[9999px] -top-[9999px] whitespace-nowrap px-1 text-[12px] font-medium tracking-[0.14em]"
      >
        {contextLeftLabel}
      </span>
    ) : null}
    <span
      ref={branchLabelMeasureRef}
      aria-hidden="true"
      className="pointer-events-none fixed -left-[9999px] -top-[9999px] whitespace-nowrap font-mono text-[10px] font-semibold tracking-[0.05em]"
    />
    {promptGitContext || contextLeftLabel ? (
      <div
        ref={promptGitContextRowRef}
        data-testid="prompt-git-context-row"
        className="-my-0.5 flex items-center justify-between gap-2"
      >
        <div ref={promptGitContextLeftRef} className="flex min-w-0 flex-1 items-center gap-1.5">
          {isVirtualActive ? (
            <IconButton
              type="button"
              size="xs"
              variant="dangerOutline"
              aria-label="Clear virtual worktree"
              title="Clear virtual worktree"
              className="shrink-0"
              onClick={() => {
                onClearVirtualWorktree?.();
                onCloseWorktreeSelector();
              }}
            >
              <X className="h-3 w-3" />
            </IconButton>
          ) : null}
          <div ref={branchPillContainerRef} className={branchContainerClassName}>
            {worktreeSelectorEnabled ? (
              <button
                type="button"
                className={cn(
                  "border-latte-surface2/70 bg-latte-base/70 text-latte-text inline-flex min-w-0 max-w-full items-center gap-1 rounded-full border px-2 py-[3px] text-[10px] font-semibold tracking-[0.05em]",
                  branchTriggerWidthClassName,
                )}
                title={gitBranchLabel ?? undefined}
                aria-label="Select worktree"
                onClick={onToggleWorktreeSelector}
                data-testid="worktree-selector-trigger"
              >
                <GitBranch className="text-latte-subtext0 h-3 w-3 shrink-0" />
                <span className={branchLabelSlotClassName}>
                  <span className={LEADING_TRUNCATE_CLASS_NAME}>{displayGitBranchLabel}</span>
                </span>
                <ChevronsUpDown className="text-latte-subtext0 h-2.5 w-2.5 shrink-0" />
              </button>
            ) : (
              <TagPill
                tone="neutral"
                className={cn(
                  "text-latte-text inline-flex min-w-0 max-w-full items-center gap-1 px-2 py-[3px] text-[10px] font-semibold tracking-[0.05em]",
                  branchTriggerWidthClassName,
                )}
                title={gitBranchLabel ?? undefined}
              >
                <GitBranch className="text-latte-subtext0 h-3 w-3 shrink-0" />
                <span className={branchLabelSlotClassName}>
                  <span className={LEADING_TRUNCATE_CLASS_NAME}>{displayGitBranchLabel}</span>
                </span>
              </TagPill>
            )}
            {worktreeSelectorEnabled && isWorktreeSelectorOpen ? (
              <ScreenPanelWorktreeSelectorPanel
                entries={displayedWorktreeEntries}
                worktreeRepoRoot={worktreeRepoRoot}
                worktreeBaseBranch={worktreeBaseBranch}
                virtualWorktreePath={virtualWorktreePath}
                actualWorktreePath={actualWorktreePath}
                worktreeSelectorLoading={worktreeSelectorLoading}
                worktreeSelectorError={worktreeSelectorError}
                onRefresh={onRefreshWorktrees ?? onRefresh}
                onClose={() => {
                  onCloseWorktreeSelector();
                }}
                onSelectVirtualWorktree={onSelectVirtualWorktree}
              />
            ) : null}
          </div>
          {isVirtualActive ? (
            <TagPill
              tone="meta"
              aria-label="Virtual worktree active"
              title="Virtual worktree active"
              className="border-latte-lavender/50 bg-latte-lavender/10 text-latte-lavender inline-flex shrink-0 items-center justify-center px-2 py-[3px] text-[10px] font-semibold tracking-[0.08em]"
            >
              Virt
            </TagPill>
          ) : null}
          {promptGitContext ? (
            <>
              {visibleFileChangeCategories.map((item) => (
                <TagPill
                  key={item.key}
                  tone="meta"
                  className={cn(
                    item.className,
                    "shrink-0 px-2 py-[3px] text-[10px] font-semibold uppercase tracking-[0.08em]",
                  )}
                >
                  {item.label} {item.value}
                </TagPill>
              ))}
              <span className="text-latte-green shrink-0 text-[11px] font-semibold">
                +{gitAdditionsLabel}
              </span>
              <span className="text-latte-red shrink-0 text-[11px] font-semibold">
                -{gitDeletionsLabel}
              </span>
            </>
          ) : null}
        </div>
        {contextLeftLabel && !isContextInStatusRow ? (
          <span className="text-latte-subtext0 shrink-0 px-1 text-[12px] font-medium tracking-[0.14em]">
            {contextLeftLabel}
          </span>
        ) : null}
      </div>
    ) : null}
    {pollingPauseMeta || (contextLeftLabel && isContextInStatusRow) ? (
      <div data-testid="prompt-status-row" className="-mt-0.5 flex items-center gap-2">
        {pollingPauseMeta ? (
          <span
            className={cn(
              "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em]",
              pollingPauseMeta.className,
            )}
          >
            {pollingPauseMeta.label}
          </span>
        ) : null}
        {contextLeftLabel && isContextInStatusRow ? (
          <span className="text-latte-subtext0 ml-auto shrink-0 px-1 text-right text-[12px] font-medium tracking-[0.14em]">
            {contextLeftLabel}
          </span>
        ) : null}
      </div>
    ) : null}
  </>
);
