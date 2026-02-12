import { useMemo } from "react";

import type { SessionDetailViewProps } from "../SessionDetailView";
import {
  buildCommitSectionProps,
  buildDiffSectionProps,
  buildStateTimelineSectionProps,
} from "./section-props-builders";

export const useSessionDetailViewDataSectionProps = ({
  meta,
  timeline,
  diffs,
  commits,
}: SessionDetailViewProps) => {
  const {
    timeline: stateTimeline,
    timelineRange,
    timelineError,
    timelineLoading,
    timelineExpanded,
    isMobile,
    setTimelineRange,
    toggleTimelineExpanded,
    refreshTimeline,
  } = timeline;
  const {
    diffSummary,
    diffError,
    diffLoading,
    diffFiles,
    diffOpen,
    diffLoadingFiles,
    refreshDiff,
    toggleDiff,
  } = diffs;
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
    refreshCommitLog,
    loadMoreCommits,
    toggleCommit,
    toggleCommitFile,
    copyHash,
  } = commits;
  const sessionBranch = meta.session?.branch ?? null;

  const diffSectionProps = useMemo(
    () =>
      buildDiffSectionProps({
        diffSummary,
        diffBranch: sessionBranch,
        diffError,
        diffLoading,
        diffFiles,
        diffOpen,
        diffLoadingFiles,
        refreshDiff,
        toggleDiff,
      }),
    [
      diffSummary,
      sessionBranch,
      diffError,
      diffLoading,
      diffFiles,
      diffOpen,
      diffLoadingFiles,
      refreshDiff,
      toggleDiff,
    ],
  );

  const stateTimelineSectionProps = useMemo(
    () =>
      buildStateTimelineSectionProps({
        stateTimeline,
        timelineRange,
        timelineError,
        timelineLoading,
        timelineExpanded,
        isMobile,
        setTimelineRange,
        refreshTimeline,
        toggleTimelineExpanded,
      }),
    [
      stateTimeline,
      timelineRange,
      timelineError,
      timelineLoading,
      timelineExpanded,
      isMobile,
      setTimelineRange,
      refreshTimeline,
      toggleTimelineExpanded,
    ],
  );

  const commitSectionProps = useMemo(
    () =>
      buildCommitSectionProps({
        commitLog,
        commitBranch: sessionBranch,
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
      }),
    [
      commitLog,
      sessionBranch,
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
    ],
  );

  return {
    diffSectionProps,
    stateTimelineSectionProps,
    commitSectionProps,
  };
};
