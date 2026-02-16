import { useCallback, useMemo } from "react";

import type { SessionDetailViewProps } from "../SessionDetailView";
import {
  buildCommitSectionProps,
  buildDiffSectionProps,
  buildNotesSectionProps,
  buildStateTimelineSectionProps,
} from "./section-props-builders";

export const useSessionDetailViewDataSectionProps = ({
  meta,
  timeline,
  screen,
  diffs,
  files,
  commits,
  notes,
}: SessionDetailViewProps) => {
  const { paneId, session } = meta;
  const sourceRepoRoot = screen.effectiveWorktreePath ?? session?.repoRoot ?? null;
  const {
    timeline: stateTimeline,
    timelineScope,
    timelineRange,
    hasRepoTimeline,
    timelineError,
    timelineLoading,
    timelineExpanded,
    isMobile,
    setTimelineScope,
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
  const { onResolveLogFileReference, onResolveLogFileReferenceCandidates } = files;
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
  const {
    repoRoot,
    notes: repoNotes,
    notesLoading,
    notesError,
    creatingNote,
    savingNoteId,
    deletingNoteId,
    refreshNotes,
    createNote,
    saveNote,
    removeNote,
  } = notes;
  const sessionBranch = screen.effectiveBranch ?? session?.branch ?? null;

  const handleResolveFileReference = useCallback(
    (rawToken: string) =>
      onResolveLogFileReference({
        rawToken,
        sourcePaneId: paneId,
        sourceRepoRoot,
      }),
    [onResolveLogFileReference, paneId, sourceRepoRoot],
  );

  const handleResolveFileReferenceCandidates = useCallback(
    (rawTokens: string[]) =>
      onResolveLogFileReferenceCandidates({
        rawTokens,
        sourcePaneId: paneId,
        sourceRepoRoot,
      }),
    [onResolveLogFileReferenceCandidates, paneId, sourceRepoRoot],
  );

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
        onResolveFileReference: handleResolveFileReference,
        onResolveFileReferenceCandidates: handleResolveFileReferenceCandidates,
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
      handleResolveFileReference,
      handleResolveFileReferenceCandidates,
    ],
  );

  const stateTimelineSectionProps = useMemo(
    () =>
      buildStateTimelineSectionProps({
        stateTimeline,
        timelineScope,
        timelineRange,
        hasRepoTimeline,
        timelineError,
        timelineLoading,
        timelineExpanded,
        isMobile,
        setTimelineScope,
        setTimelineRange,
        refreshTimeline,
        toggleTimelineExpanded,
      }),
    [
      stateTimeline,
      timelineScope,
      timelineRange,
      hasRepoTimeline,
      timelineError,
      timelineLoading,
      timelineExpanded,
      isMobile,
      setTimelineScope,
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
        onResolveFileReference: handleResolveFileReference,
        onResolveFileReferenceCandidates: handleResolveFileReferenceCandidates,
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
      handleResolveFileReference,
      handleResolveFileReferenceCandidates,
    ],
  );

  const notesSectionProps = useMemo(
    () =>
      buildNotesSectionProps({
        repoRoot,
        notes: repoNotes,
        notesLoading,
        notesError,
        creatingNote,
        savingNoteId,
        deletingNoteId,
        refreshNotes,
        createNote,
        saveNote,
        removeNote,
      }),
    [
      createNote,
      creatingNote,
      deletingNoteId,
      notesError,
      notesLoading,
      refreshNotes,
      removeNote,
      repoNotes,
      repoRoot,
      saveNote,
      savingNoteId,
    ],
  );

  return {
    diffSectionProps,
    stateTimelineSectionProps,
    commitSectionProps,
    notesSectionProps,
  };
};
