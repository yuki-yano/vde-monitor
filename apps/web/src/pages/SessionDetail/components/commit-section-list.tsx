import type { CommitDetail, CommitFileDiff, CommitLog } from "@vde-monitor/shared";
import { ArrowDown, Check, ChevronDown, ChevronUp, Copy } from "lucide-react";
import { type KeyboardEvent as ReactKeyboardEvent, memo, useRef } from "react";

import {
  Button,
  ChipButton,
  FilePathLabel,
  InsetPanel,
  PanelSection,
  TagPill,
} from "@/components/ui";
import { cn } from "@/lib/cn";

import {
  diffStatusClass,
  formatDiffCount,
  formatDiffStatusLabel,
  formatTimestamp,
  sumFileStats,
} from "../sessionDetailUtils";
import { DiffPatch } from "./DiffPatch";

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
  onResolveFileReference?: (rawToken: string) => Promise<void>;
  onResolveFileReferenceCandidates?: (rawTokens: string[]) => Promise<string[]>;
};

type CommitFileDetailContentProps = {
  loadingFile: boolean;
  fileDetail?: CommitFileDiff;
  renderedPatch?: string[];
  onResolveFileReference?: (rawToken: string) => Promise<void>;
  onResolveFileReferenceCandidates?: (rawTokens: string[]) => Promise<string[]>;
};

type CommitFileRowsProps = {
  commitHash: string;
  files: CommitDetail["files"];
  commitFileOpen: Record<string, boolean>;
  commitFileDetails: Record<string, CommitFileDiff>;
  commitFileLoading: Record<string, boolean>;
  renderedPatches: Record<string, string[]>;
  onToggleCommitFile: (hash: string, path: string) => void;
  onResolveFileReference?: (rawToken: string) => Promise<void>;
  onResolveFileReferenceCandidates?: (rawTokens: string[]) => Promise<string[]>;
};

type CommitExpandedSectionProps = {
  commitHash: string;
  detail?: CommitDetail;
  loadingDetail: boolean;
  commitBody: string | null;
  commitFileOpen: Record<string, boolean>;
  commitFileDetails: Record<string, CommitFileDiff>;
  commitFileLoading: Record<string, boolean>;
  renderedPatches: Record<string, string[]>;
  onToggleCommitFile: (hash: string, path: string) => void;
  onResolveFileReference?: (rawToken: string) => Promise<void>;
  onResolveFileReferenceCandidates?: (rawTokens: string[]) => Promise<string[]>;
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
  onResolveFileReference?: (rawToken: string) => Promise<void>;
  onResolveFileReferenceCandidates?: (rawTokens: string[]) => Promise<string[]>;
};

export type CommitListProps = {
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
  onResolveFileReference?: (rawToken: string) => Promise<void>;
  onResolveFileReferenceCandidates?: (rawTokens: string[]) => Promise<string[]>;
};

export type CommitLoadMoreButtonProps = {
  canLoadMore: boolean;
  commitLoadingMore: boolean;
  onLoadMore: () => void;
};

const isKeyboardActivationKey = (event: ReactKeyboardEvent<HTMLElement>) =>
  event.key === "Enter" || event.key === " ";

const buildCommitFilesSection = ({
  commitHash,
  detail,
  commitFileOpen,
  commitFileDetails,
  commitFileLoading,
  renderedPatches,
  onToggleCommitFile,
  onResolveFileReference,
  onResolveFileReferenceCandidates,
}: Pick<
  CommitExpandedSectionProps,
  | "commitHash"
  | "detail"
  | "commitFileOpen"
  | "commitFileDetails"
  | "commitFileLoading"
  | "renderedPatches"
  | "onToggleCommitFile"
  | "onResolveFileReference"
  | "onResolveFileReferenceCandidates"
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
      onResolveFileReference={onResolveFileReference}
      onResolveFileReferenceCandidates={onResolveFileReferenceCandidates}
    />
  );
};

const CommitFileDetailContent = memo(
  ({
    loadingFile,
    fileDetail,
    renderedPatch,
    onResolveFileReference,
    onResolveFileReferenceCandidates,
  }: CommitFileDetailContentProps) => {
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
        {renderedPatch && (
          <DiffPatch
            lines={renderedPatch}
            onResolveFileReference={onResolveFileReference}
            onResolveFileReferenceCandidates={onResolveFileReferenceCandidates}
          />
        )}
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
    onResolveFileReference,
    onResolveFileReferenceCandidates,
  }: CommitFileRowProps) => {
    const labelContainerRef = useRef<HTMLDivElement | null>(null);
    const statusLabel = formatDiffStatusLabel(file.status);
    const toggleFile = () => {
      onToggleCommitFile(commitHash, file.path);
    };
    const handleFileKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (!isKeyboardActivationKey(event)) {
        return;
      }
      event.preventDefault();
      toggleFile();
    };

    return (
      <div className="flex flex-col gap-2">
        <div
          role="button"
          tabIndex={0}
          aria-expanded={fileOpen}
          aria-label={
            fileOpen ? `Collapse file diff ${file.path}` : `Expand file diff ${file.path}`
          }
          onClick={toggleFile}
          onKeyDown={handleFileKeyDown}
          className="focus-visible:ring-latte-lavender/30 grid w-full cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2"
        >
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <TagPill tone="status" className={cn(diffStatusClass(statusLabel), "shrink-0")}>
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
            <span className="text-latte-overlay1" aria-hidden="true">
              {fileOpen ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
            </span>
          </div>
        </div>
        {fileOpen && (
          <div className="border-latte-surface2/70 bg-latte-base/60 rounded-xl border px-2.5 py-1.5 sm:px-3 sm:py-2">
            <CommitFileDetailContent
              loadingFile={loadingFile}
              fileDetail={fileDetail}
              renderedPatch={renderedPatch}
              onResolveFileReference={onResolveFileReference}
              onResolveFileReferenceCandidates={onResolveFileReferenceCandidates}
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
    onResolveFileReference,
    onResolveFileReferenceCandidates,
  }: CommitFileRowsProps) => (
    <div className="flex flex-col gap-1.5 text-xs sm:gap-2">
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
            onResolveFileReference={onResolveFileReference}
            onResolveFileReferenceCandidates={onResolveFileReferenceCandidates}
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
    commitFileOpen,
    commitFileDetails,
    commitFileLoading,
    renderedPatches,
    onToggleCommitFile,
    onResolveFileReference,
    onResolveFileReferenceCandidates,
  }: CommitExpandedSectionProps) => {
    if (loadingDetail) {
      return <p className="text-latte-subtext0 text-xs">Loading commit…</p>;
    }
    const totals = sumFileStats(detail?.files);
    const commitFilesSection = buildCommitFilesSection({
      commitHash,
      detail,
      commitFileOpen,
      commitFileDetails,
      commitFileLoading,
      renderedPatches,
      onToggleCommitFile,
      onResolveFileReference,
      onResolveFileReferenceCandidates,
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
    onResolveFileReference,
    onResolveFileReferenceCandidates,
  }: CommitItemProps) => {
    const commitBody = detail?.body ?? commit.body;
    const toggleCommit = () => {
      onToggleCommit(commit.hash);
    };
    const handleCommitKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.target !== event.currentTarget) {
        return;
      }
      if (!isKeyboardActivationKey(event)) {
        return;
      }
      event.preventDefault();
      toggleCommit();
    };

    return (
      <InsetPanel>
        <div
          role="button"
          tabIndex={0}
          aria-expanded={isOpen}
          aria-label={
            isOpen ? `Collapse commit ${commit.shortHash}` : `Expand commit ${commit.shortHash}`
          }
          className="focus-visible:ring-latte-lavender/30 flex w-full cursor-pointer flex-wrap items-start gap-2.5 rounded-md px-2.5 py-1.5 focus-visible:outline-none focus-visible:ring-2 sm:gap-3 sm:px-3 sm:py-2"
          onClick={toggleCommit}
          onKeyDown={handleCommitKeyDown}
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
              aria-hidden="true"
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
              commitFileOpen={commitFileOpen}
              commitFileDetails={commitFileDetails}
              commitFileLoading={commitFileLoading}
              renderedPatches={renderedPatches}
              onToggleCommitFile={onToggleCommitFile}
              onResolveFileReference={onResolveFileReference}
              onResolveFileReferenceCandidates={onResolveFileReferenceCandidates}
            />
          </PanelSection>
        )}
      </InsetPanel>
    );
  },
);

CommitItem.displayName = "CommitItem";

export const CommitList = memo(
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
    onResolveFileReference,
    onResolveFileReferenceCandidates,
  }: CommitListProps) => (
    <div className="flex flex-col gap-1.5 sm:gap-2">
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
          onResolveFileReference={onResolveFileReference}
          onResolveFileReferenceCandidates={onResolveFileReferenceCandidates}
        />
      ))}
    </div>
  ),
);

CommitList.displayName = "CommitList";

export const CommitLoadMoreButton = memo(
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
