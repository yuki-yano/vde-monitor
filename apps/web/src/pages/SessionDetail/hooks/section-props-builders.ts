import type {
  CommitDetail,
  CommitFileDiff,
  CommitLog,
  DiffFile,
  DiffSummary,
  SessionStateTimeline,
  SessionStateTimelineRange,
} from "@vde-monitor/shared";

type BuildDiffSectionPropsArgs = {
  diffSummary: DiffSummary | null;
  diffError: string | null;
  diffLoading: boolean;
  diffFiles: Record<string, DiffFile>;
  diffOpen: Record<string, boolean>;
  diffLoadingFiles: Record<string, boolean>;
  refreshDiff: () => void;
  toggleDiff: (path: string) => void;
};

type BuildStateTimelineSectionPropsArgs = {
  stateTimeline: SessionStateTimeline | null;
  timelineRange: SessionStateTimelineRange;
  timelineError: string | null;
  timelineLoading: boolean;
  timelineExpanded: boolean;
  isMobile: boolean;
  setTimelineRange: (range: SessionStateTimelineRange) => void;
  refreshTimeline: () => void;
  toggleTimelineExpanded: () => void;
};

type BuildCommitSectionPropsArgs = {
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
  refreshCommitLog: () => void;
  loadMoreCommits: () => void;
  toggleCommit: (hash: string) => void;
  toggleCommitFile: (hash: string, path: string) => void;
  copyHash: (hash: string) => void;
};

export const buildDiffSectionProps = ({
  diffSummary,
  diffError,
  diffLoading,
  diffFiles,
  diffOpen,
  diffLoadingFiles,
  refreshDiff,
  toggleDiff,
}: BuildDiffSectionPropsArgs) => ({
  state: {
    diffSummary,
    diffError,
    diffLoading,
    diffFiles,
    diffOpen,
    diffLoadingFiles,
  },
  actions: {
    onRefresh: refreshDiff,
    onToggle: toggleDiff,
  },
});

export const buildStateTimelineSectionProps = ({
  stateTimeline,
  timelineRange,
  timelineError,
  timelineLoading,
  timelineExpanded,
  isMobile,
  setTimelineRange,
  refreshTimeline,
  toggleTimelineExpanded,
}: BuildStateTimelineSectionPropsArgs) => ({
  state: {
    timeline: stateTimeline,
    timelineRange,
    timelineError,
    timelineLoading,
    timelineExpanded,
    isMobile,
  },
  actions: {
    onTimelineRangeChange: setTimelineRange,
    onTimelineRefresh: refreshTimeline,
    onToggleTimelineExpanded: toggleTimelineExpanded,
  },
});

export const buildCommitSectionProps = ({
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
  refreshCommitLog,
  loadMoreCommits,
  toggleCommit,
  toggleCommitFile,
  copyHash,
}: BuildCommitSectionPropsArgs) => ({
  state: {
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
  },
  actions: {
    onRefresh: refreshCommitLog,
    onLoadMore: loadMoreCommits,
    onToggleCommit: toggleCommit,
    onToggleCommitFile: toggleCommitFile,
    onCopyHash: copyHash,
  },
});
