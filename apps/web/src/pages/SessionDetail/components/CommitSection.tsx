import type { CommitDetail, CommitFileDiff, CommitLog } from "@vde-monitor/shared";
import { GitCommitHorizontal, RefreshCw } from "lucide-react";
import { memo, useMemo } from "react";

import { Button, Callout, EmptyState, LoadingOverlay } from "@/components/ui";
import { PaneSectionShell } from "@/features/shared-session-ui/components/PaneSectionShell";
import { API_ERROR_MESSAGES } from "@/lib/api-messages";

import { formatBranchLabel, formatPath } from "../sessionDetailUtils";
import { CommitList, CommitLoadMoreButton } from "./commit-section-list";
import {
  buildCommitListClassName,
  buildRenderedPatches,
  formatCommitCountDescription,
  getCommits,
  isCommitListEmpty,
  shouldShowLoadMore,
} from "./commit-section-utils";

type CommitSectionState = {
  commitLog: CommitLog | null;
  commitBranch: string | null;
  commitError: string | null;
  commitLoading: boolean;
  commitLoadingMore: boolean;
  commitHasMore: boolean;
  commitDetails: Record<string, CommitDetail>;
  commitFileDetails: Record<string, CommitFileDiff>;
  commitFileOpen: Record<string, boolean>;
  commitFileLoading: Record<string, boolean>;
  commitOpen: Record<string, boolean>;
  commitLoadingDetails: Record<string, boolean>;
  copiedHash: string | null;
};

type CommitSectionActions = {
  onRefresh: () => void;
  onLoadMore: () => void;
  onToggleCommit: (hash: string) => void;
  onToggleCommitFile: (hash: string, path: string) => void;
  onCopyHash: (hash: string) => void;
  onResolveFileReference?: (rawToken: string) => Promise<void>;
  onResolveFileReferenceCandidates?: (rawTokens: string[]) => Promise<string[]>;
};

type CommitSectionProps = {
  state: CommitSectionState;
  actions: CommitSectionActions;
};

const CommitReasonCallout = memo(({ reason }: { reason: CommitLog["reason"] | undefined }) => {
  switch (reason) {
    case "cwd_unknown":
      return (
        <Callout tone="warning" size="xs">
          Working directory is unknown for this session.
        </Callout>
      );
    case "not_git":
      return (
        <Callout tone="warning" size="xs">
          Current directory is not a git repository.
        </Callout>
      );
    case "error":
      return (
        <Callout tone="error" size="xs">
          {API_ERROR_MESSAGES.commitLog}.
        </Callout>
      );
    default:
      return null;
  }
});

CommitReasonCallout.displayName = "CommitReasonCallout";

const CommitRepoRoot = memo(({ repoRoot }: { repoRoot?: string | null }) => {
  if (!repoRoot) {
    return null;
  }
  return <p className="text-latte-subtext0 text-xs">Repo: {formatPath(repoRoot)}</p>;
});

CommitRepoRoot.displayName = "CommitRepoRoot";

const CommitErrorCallout = memo(({ commitError }: { commitError: string | null }) => {
  if (!commitError) {
    return null;
  }
  return (
    <Callout tone="error" size="xs">
      {commitError}
    </Callout>
  );
});

CommitErrorCallout.displayName = "CommitErrorCallout";

const CommitLoadingOverlay = memo(({ commitLoading }: { commitLoading: boolean }) => {
  if (!commitLoading) {
    return null;
  }
  return <LoadingOverlay label="Loading commits..." blocking={false} />;
});

CommitLoadingOverlay.displayName = "CommitLoadingOverlay";

const CommitEmptyStateNotice = memo(({ showEmptyState }: { showEmptyState: boolean }) => {
  if (!showEmptyState) {
    return null;
  }
  return (
    <EmptyState
      icon={<GitCommitHorizontal className="text-latte-overlay1 h-6 w-6" />}
      message="No commits in this repository yet"
      iconWrapperClassName="bg-latte-surface1/50"
    />
  );
});

CommitEmptyStateNotice.displayName = "CommitEmptyStateNotice";

export const CommitSection = memo(({ state, actions }: CommitSectionProps) => {
  const {
    commitLog,
    commitBranch,
    commitError,
    commitLoading,
    commitLoadingMore,
    commitHasMore,
    commitDetails,
    commitFileDetails,
    commitFileOpen,
    commitFileLoading,
    commitOpen,
    commitLoadingDetails,
    copiedHash,
  } = state;
  const {
    onRefresh,
    onLoadMore,
    onToggleCommit,
    onToggleCommitFile,
    onCopyHash,
    onResolveFileReference,
    onResolveFileReferenceCandidates,
  } = actions;
  const renderedPatches = useMemo(
    () => buildRenderedPatches(commitFileOpen, commitFileDetails),
    [commitFileDetails, commitFileOpen],
  );
  const commitCountDescription = formatCommitCountDescription(commitLog);
  const commitHeaderDescription = (
    <span className="inline-flex items-center gap-1.5">
      <span>{commitCountDescription}</span>
      {commitBranch ? (
        <span className="text-latte-subtext0/80 inline-flex items-center gap-1 font-mono text-[11px]">
          <span aria-hidden="true">·</span>
          <span>{formatBranchLabel(commitBranch)}</span>
        </span>
      ) : null}
    </span>
  );
  const commits = getCommits(commitLog);
  const showEmptyState = isCommitListEmpty(commitLog);
  const canLoadMore = shouldShowLoadMore(commitLog, commitHasMore);

  return (
    <PaneSectionShell
      title="Commit Log"
      description={commitHeaderDescription}
      action={
        <Button
          variant="ghost"
          size="sm"
          className="text-latte-subtext0 hover:text-latte-text h-[30px] w-[30px] shrink-0 self-start p-0"
          onClick={onRefresh}
          disabled={commitLoading}
          aria-label="Refresh commit log"
        >
          <RefreshCw className="h-4 w-4" />
          <span className="sr-only">Refresh</span>
        </Button>
      }
      status={
        <>
          <CommitRepoRoot repoRoot={commitLog?.repoRoot} />
          <CommitReasonCallout reason={commitLog?.reason} />
          <CommitErrorCallout commitError={commitError} />
        </>
      }
    >
      <div className={buildCommitListClassName(commitLoading)}>
        <CommitLoadingOverlay commitLoading={commitLoading} />
        <CommitEmptyStateNotice showEmptyState={showEmptyState} />
        <CommitList
          commits={commits}
          commitDetails={commitDetails}
          commitLoadingDetails={commitLoadingDetails}
          commitOpen={commitOpen}
          copiedHash={copiedHash}
          commitFileOpen={commitFileOpen}
          commitFileDetails={commitFileDetails}
          commitFileLoading={commitFileLoading}
          renderedPatches={renderedPatches}
          onToggleCommit={onToggleCommit}
          onToggleCommitFile={onToggleCommitFile}
          onCopyHash={onCopyHash}
          onResolveFileReference={onResolveFileReference}
          onResolveFileReferenceCandidates={onResolveFileReferenceCandidates}
        />
      </div>
      <CommitLoadMoreButton
        canLoadMore={canLoadMore}
        commitLoadingMore={commitLoadingMore}
        onLoadMore={onLoadMore}
      />
    </PaneSectionShell>
  );
});

CommitSection.displayName = "CommitSection";
