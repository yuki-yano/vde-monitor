import type { WorktreeListEntry } from "@vde-monitor/shared";
import { GitBranch, RefreshCw, X } from "lucide-react";
import { useMemo } from "react";

import { Button, Card, IconButton } from "@/components/ui";

import { sortWorktreeEntriesByRepoRoot } from "./worktree-view-model";
import { WorktreeEntryList } from "./WorktreeEntryList";
import { WorktreeStatusStack } from "./WorktreeStatusStack";

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

  const displayedWorktreeEntries = useMemo(
    () => sortWorktreeEntriesByRepoRoot(worktreeEntries, worktreeRepoRoot),
    [worktreeEntries, worktreeRepoRoot],
  );
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

      <WorktreeStatusStack
        loading={worktreeSelectorLoading}
        error={worktreeSelectorError}
        entriesCount={worktreeEntries.length}
      />
      {!showBlockingWorktreeLoading && !worktreeSelectorError ? (
        <div className="space-y-1">
          <WorktreeEntryList
            entries={displayedWorktreeEntries}
            worktreeRepoRoot={worktreeRepoRoot}
            worktreeBaseBranch={worktreeBaseBranch}
            virtualWorktreePath={virtualWorktreePath}
            actualWorktreePath={actualWorktreePath}
            onSelectVirtualWorktree={onSelectVirtualWorktree}
            variant="section"
          />
        </div>
      ) : null}
    </Card>
  );
};
