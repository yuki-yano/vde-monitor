import type { CommitDetail, CommitFileDiff, CommitLog } from "@vde-monitor/shared";
import {
  ArrowDown,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  GitCommitHorizontal,
  RefreshCw,
} from "lucide-react";
import { memo, useMemo, useRef } from "react";

import {
  Button,
  Callout,
  Card,
  ChipButton,
  EmptyState,
  FilePathLabel,
  InsetPanel,
  LoadingOverlay,
  PanelSection,
  SectionHeader,
  TagPill,
} from "@/components/ui";
import { API_ERROR_MESSAGES } from "@/lib/api-messages";

import {
  diffStatusClass,
  formatDiffCount,
  formatDiffStatusLabel,
  formatPath,
  formatTimestamp,
  sumFileStats,
} from "../sessionDetailUtils";
import { DiffPatch } from "./DiffPatch";

type CommitSectionState = {
  commitLog: CommitLog | null;
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
};

type CommitSectionProps = {
  state: CommitSectionState;
  actions: CommitSectionActions;
};

type CommitFileRowProps = {
  commitHash: string;
  file: CommitDetail["files"][number];
  fileOpen: boolean;
  additions: string;
  deletions: string;
  loadingFile: boolean;
  fileDetail?: CommitFileDiff;
  renderedPatch?: string[];
  onToggleCommitFile: (hash: string, path: string) => void;
};

type CommitFileDetailContentProps = {
  loadingFile: boolean;
  fileDetail?: CommitFileDiff;
  renderedPatch?: string[];
};

type CommitFileRowsProps = {
  commitHash: string;
  files: CommitDetail["files"];
  commitFileOpen: Record<string, boolean>;
  commitFileDetails: Record<string, CommitFileDiff>;
  commitFileLoading: Record<string, boolean>;
  renderedPatches: Record<string, string[]>;
  onToggleCommitFile: (hash: string, path: string) => void;
};

type CommitExpandedSectionProps = {
  commitHash: string;
  detail?: CommitDetail;
  loadingDetail: boolean;
  commitBody: string | null;
  totals: ReturnType<typeof sumFileStats>;
  commitFileOpen: Record<string, boolean>;
  commitFileDetails: Record<string, CommitFileDiff>;
  commitFileLoading: Record<string, boolean>;
  renderedPatches: Record<string, string[]>;
  onToggleCommitFile: (hash: string, path: string) => void;
};

type CommitItemProps = {
  commit: CommitLog["commits"][number];
  detail?: CommitDetail;
  loadingDetail: boolean;
  isOpen: boolean;
  copiedHash: string | null;
  commitFileOpen: Record<string, boolean>;
  commitFileDetails: Record<string, CommitFileDiff>;
  commitFileLoading: Record<string, boolean>;
  renderedPatches: Record<string, string[]>;
  onToggleCommit: (hash: string) => void;
  onToggleCommitFile: (hash: string, path: string) => void;
  onCopyHash: (hash: string) => void;
};

type CommitListProps = {
  commits: CommitLog["commits"];
  commitDetails: Record<string, CommitDetail>;
  commitLoadingDetails: Record<string, boolean>;
  commitOpen: Record<string, boolean>;
  copiedHash: string | null;
  commitFileOpen: Record<string, boolean>;
  commitFileDetails: Record<string, CommitFileDiff>;
  commitFileLoading: Record<string, boolean>;
  renderedPatches: Record<string, string[]>;
  onToggleCommit: (hash: string) => void;
  onToggleCommitFile: (hash: string, path: string) => void;
  onCopyHash: (hash: string) => void;
};

type CommitLoadMoreButtonProps = {
  canLoadMore: boolean;
  commitLoadingMore: boolean;
  onLoadMore: () => void;
};

const formatCommitCountDescription = (commitLog: CommitLog | null) => {
  const currentCount = commitLog?.commits.length ?? 0;
  const totalCount = commitLog?.totalCount ?? currentCount;
  const suffix = totalCount === 1 ? "" : "s";
  return `${currentCount}/${totalCount} commit${suffix}`;
};

const buildRenderedPatches = (
  commitFileOpen: Record<string, boolean>,
  commitFileDetails: Record<string, CommitFileDiff>,
) => {
  const next: Record<string, string[]> = {};
  Object.entries(commitFileOpen).forEach(([key, isOpen]) => {
    if (!isOpen) return;
    const patch = commitFileDetails[key]?.patch;
    if (!patch) return;
    next[key] = patch.split("\n");
  });
  return next;
};

const isCommitListEmpty = (commitLog: CommitLog | null) => {
  if (!commitLog) return false;
  return commitLog.commits.length === 0 && !commitLog.reason;
};

const shouldShowLoadMore = (commitLog: CommitLog | null, commitHasMore: boolean) => {
  if (!commitLog || commitLog.reason) return false;
  return commitHasMore;
};

const getCommits = (commitLog: CommitLog | null) => commitLog?.commits ?? [];

const buildCommitListClassName = (commitLoading: boolean) =>
  `relative ${commitLoading ? "min-h-[120px]" : ""}`;

const buildCommitFilesSection = ({
  commitHash,
  detail,
  commitFileOpen,
  commitFileDetails,
  commitFileLoading,
  renderedPatches,
  onToggleCommitFile,
}: Pick<
  CommitExpandedSectionProps,
  | "commitHash"
  | "detail"
  | "commitFileOpen"
  | "commitFileDetails"
  | "commitFileLoading"
  | "renderedPatches"
  | "onToggleCommitFile"
>) => {
  if (!detail) {
    return <p className="text-latte-subtext0 text-xs">No commit details.</p>;
  }
  if (!detail.files) {
    return null;
  }
  if (detail.files.length === 0) {
    return <p className="text-latte-subtext0 text-xs">No files changed.</p>;
  }
  return (
    <CommitFileRows
      commitHash={commitHash}
      files={detail.files}
      commitFileOpen={commitFileOpen}
      commitFileDetails={commitFileDetails}
      commitFileLoading={commitFileLoading}
      renderedPatches={renderedPatches}
      onToggleCommitFile={onToggleCommitFile}
    />
  );
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

const CommitFileDetailContent = memo(
  ({ loadingFile, fileDetail, renderedPatch }: CommitFileDetailContentProps) => {
    if (loadingFile) {
      return <p className="text-latte-subtext0 text-xs">Loading diff…</p>;
    }
    if (fileDetail?.binary) {
      return <p className="text-latte-subtext0 text-xs">Binary file (no diff).</p>;
    }
    if (!fileDetail?.patch) {
      return <p className="text-latte-subtext0 text-xs">No diff available.</p>;
    }
    return (
      <div className="custom-scrollbar max-h-[240px] overflow-auto">
        {renderedPatch && <DiffPatch lines={renderedPatch} />}
        {fileDetail.truncated && (
          <p className="text-latte-subtext0 mt-2 text-xs">Diff truncated.</p>
        )}
      </div>
    );
  },
);

CommitFileDetailContent.displayName = "CommitFileDetailContent";

const CommitFileRow = memo(
  ({
    commitHash,
    file,
    fileOpen,
    additions,
    deletions,
    loadingFile,
    fileDetail,
    renderedPatch,
    onToggleCommitFile,
  }: CommitFileRowProps) => {
    const labelContainerRef = useRef<HTMLDivElement | null>(null);
    const statusLabel = formatDiffStatusLabel(file.status);

    return (
      <div key={`${file.path}-${file.status}`} className="flex flex-col gap-2">
        <div
          onClick={() => onToggleCommitFile(commitHash, file.path)}
          className="grid w-full cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-2"
        >
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <TagPill tone="status" className={`${diffStatusClass(statusLabel)} shrink-0`}>
              {statusLabel}
            </TagPill>
            <div ref={labelContainerRef} className="min-w-0 flex-1">
              <FilePathLabel
                path={file.path}
                renamedFrom={file.renamedFrom}
                size="xs"
                dirTruncate="segments"
                dirReservePx={12}
                measureRef={labelContainerRef}
                className="w-full font-mono"
              />
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-3 whitespace-nowrap text-xs">
            <span className="text-latte-green">+{additions}</span>
            <span className="text-latte-red">-{deletions}</span>
            <span className="text-latte-overlay1">
              {fileOpen ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
            </span>
          </div>
        </div>
        {fileOpen && (
          <div className="border-latte-surface2/70 bg-latte-base/60 rounded-xl border px-3 py-2">
            <CommitFileDetailContent
              loadingFile={loadingFile}
              fileDetail={fileDetail}
              renderedPatch={renderedPatch}
            />
          </div>
        )}
      </div>
    );
  },
);

CommitFileRow.displayName = "CommitFileRow";

const CommitFileRows = memo(
  ({
    commitHash,
    files,
    commitFileOpen,
    commitFileDetails,
    commitFileLoading,
    renderedPatches,
    onToggleCommitFile,
  }: CommitFileRowsProps) => (
    <div className="flex flex-col gap-2 text-xs">
      {files.map((file) => {
        const fileKey = `${commitHash}:${file.path}`;
        return (
          <CommitFileRow
            key={`${file.path}-${file.status}`}
            commitHash={commitHash}
            file={file}
            fileOpen={Boolean(commitFileOpen[fileKey])}
            additions={formatDiffCount(file.additions)}
            deletions={formatDiffCount(file.deletions)}
            loadingFile={Boolean(commitFileLoading[fileKey])}
            fileDetail={commitFileDetails[fileKey]}
            renderedPatch={renderedPatches[fileKey]}
            onToggleCommitFile={onToggleCommitFile}
          />
        );
      })}
    </div>
  ),
);

CommitFileRows.displayName = "CommitFileRows";

const CommitExpandedSection = memo(
  ({
    commitHash,
    detail,
    loadingDetail,
    commitBody,
    totals,
    commitFileOpen,
    commitFileDetails,
    commitFileLoading,
    renderedPatches,
    onToggleCommitFile,
  }: CommitExpandedSectionProps) => {
    if (loadingDetail) {
      return <p className="text-latte-subtext0 text-xs">Loading commit…</p>;
    }
    const commitFilesSection = buildCommitFilesSection({
      commitHash,
      detail,
      commitFileOpen,
      commitFileDetails,
      commitFileLoading,
      renderedPatches,
      onToggleCommitFile,
    });

    return (
      <>
        {commitBody && (
          <pre className="text-latte-subtext0 mb-3 whitespace-pre-wrap text-xs">{commitBody}</pre>
        )}
        {totals && (
          <div className="mb-2 flex items-center gap-2 text-xs">
            <span className="text-latte-subtext0">Total changes</span>
            <span className="text-latte-green">+{totals.additions}</span>
            <span className="text-latte-red">-{totals.deletions}</span>
          </div>
        )}
        {commitFilesSection}
      </>
    );
  },
);

CommitExpandedSection.displayName = "CommitExpandedSection";

const CommitItem = memo(
  ({
    commit,
    detail,
    loadingDetail,
    isOpen,
    copiedHash,
    commitFileOpen,
    commitFileDetails,
    commitFileLoading,
    renderedPatches,
    onToggleCommit,
    onToggleCommitFile,
    onCopyHash,
  }: CommitItemProps) => {
    const commitBody = detail?.body ?? commit.body;
    const totals = sumFileStats(detail?.files);
    return (
      <InsetPanel>
        <div
          className="flex w-full cursor-pointer flex-wrap items-start gap-3 px-3 py-2"
          onClick={() => onToggleCommit(commit.hash)}
        >
          <ChipButton
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onCopyHash(commit.hash);
            }}
            aria-label={`Copy commit hash ${commit.shortHash}`}
          >
            <span className="font-mono">{commit.shortHash}</span>
            {copiedHash === commit.hash ? (
              <Check className="text-latte-green h-3.5 w-3.5" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </ChipButton>
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <div className="min-w-0">
              <p className="text-latte-text text-sm">{commit.subject}</p>
              <p className="text-latte-subtext0 text-xs">
                {commit.authorName} · {formatTimestamp(commit.authoredAt)}
              </p>
            </div>
            <span
              className="text-latte-overlay1 ml-auto flex items-center self-center px-2"
              aria-label={isOpen ? "Collapse commit" : "Expand commit"}
            >
              {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </span>
          </div>
        </div>
        {isOpen && (
          <PanelSection>
            <CommitExpandedSection
              commitHash={commit.hash}
              detail={detail}
              loadingDetail={loadingDetail}
              commitBody={commitBody}
              totals={totals}
              commitFileOpen={commitFileOpen}
              commitFileDetails={commitFileDetails}
              commitFileLoading={commitFileLoading}
              renderedPatches={renderedPatches}
              onToggleCommitFile={onToggleCommitFile}
            />
          </PanelSection>
        )}
      </InsetPanel>
    );
  },
);

CommitItem.displayName = "CommitItem";

const CommitList = memo(
  ({
    commits,
    commitDetails,
    commitLoadingDetails,
    commitOpen,
    copiedHash,
    commitFileOpen,
    commitFileDetails,
    commitFileLoading,
    renderedPatches,
    onToggleCommit,
    onToggleCommitFile,
    onCopyHash,
  }: CommitListProps) => (
    <div className="flex flex-col gap-2">
      {commits.map((commit) => (
        <CommitItem
          key={commit.hash}
          commit={commit}
          detail={commitDetails[commit.hash]}
          loadingDetail={Boolean(commitLoadingDetails[commit.hash])}
          isOpen={Boolean(commitOpen[commit.hash])}
          copiedHash={copiedHash}
          commitFileOpen={commitFileOpen}
          commitFileDetails={commitFileDetails}
          commitFileLoading={commitFileLoading}
          renderedPatches={renderedPatches}
          onToggleCommit={onToggleCommit}
          onToggleCommitFile={onToggleCommitFile}
          onCopyHash={onCopyHash}
        />
      ))}
    </div>
  ),
);

CommitList.displayName = "CommitList";

const CommitLoadMoreButton = memo(
  ({ canLoadMore, commitLoadingMore, onLoadMore }: CommitLoadMoreButtonProps) => {
    if (!canLoadMore) {
      return null;
    }
    return (
      <Button variant="ghost" size="sm" onClick={onLoadMore} disabled={commitLoadingMore}>
        <ArrowDown className="h-4 w-4" />
        {commitLoadingMore ? "Loading…" : "Load more"}
      </Button>
    );
  },
);

CommitLoadMoreButton.displayName = "CommitLoadMoreButton";

export const CommitSection = memo(({ state, actions }: CommitSectionProps) => {
  const {
    commitLog,
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
  const { onRefresh, onLoadMore, onToggleCommit, onToggleCommitFile, onCopyHash } = actions;
  const renderedPatches = useMemo(
    () => buildRenderedPatches(commitFileOpen, commitFileDetails),
    [commitFileDetails, commitFileOpen],
  );
  const commitCountDescription = formatCommitCountDescription(commitLog);
  const commits = getCommits(commitLog);
  const showEmptyState = isCommitListEmpty(commitLog);
  const canLoadMore = shouldShowLoadMore(commitLog, commitHasMore);

  return (
    <Card className="flex flex-col gap-3">
      <SectionHeader
        title="Commit Log"
        description={commitCountDescription}
        action={
          <Button
            variant="ghost"
            size="sm"
            onClick={onRefresh}
            disabled={commitLoading}
            aria-label="Refresh commit log"
          >
            <RefreshCw className="h-4 w-4" />
            <span className="sr-only">Refresh</span>
          </Button>
        }
      />
      <CommitRepoRoot repoRoot={commitLog?.repoRoot} />
      <CommitReasonCallout reason={commitLog?.reason} />
      <CommitErrorCallout commitError={commitError} />
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
        />
      </div>
      <CommitLoadMoreButton
        canLoadMore={canLoadMore}
        commitLoadingMore={commitLoadingMore}
        onLoadMore={onLoadMore}
      />
    </Card>
  );
});

CommitSection.displayName = "CommitSection";
