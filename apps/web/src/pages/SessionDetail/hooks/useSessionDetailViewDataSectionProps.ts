import { useCallback, useMemo } from "react";

import type { SessionDetailViewDataSectionsInput } from "./session-detail-view-contract";

export const useSessionDetailViewDataSectionProps = ({
  meta,
  timeline,
  screen,
  diffs,
  files,
  commits,
  notes,
}: SessionDetailViewDataSectionsInput) => {
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
  const virtualBranch = screen.virtualBranch ?? null;
  const onClearVirtualBranch = screen.clearVirtualBranch;

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
    () => ({
      state: {
        diffSummary,
        diffError,
        diffLoading,
        diffFiles,
        diffOpen,
        diffLoadingFiles,
        diffBranch: sessionBranch,
        virtualBranch,
      },
      actions: {
        onRefresh: refreshDiff,
        onToggle: toggleDiff,
        onClearVirtualBranch,
        onResolveFileReference: handleResolveFileReference,
        onResolveFileReferenceCandidates: handleResolveFileReferenceCandidates,
      },
    }),
    [
      diffSummary,
      sessionBranch,
      virtualBranch,
      diffError,
      diffLoading,
      diffFiles,
      diffOpen,
      diffLoadingFiles,
      refreshDiff,
      toggleDiff,
      onClearVirtualBranch,
      handleResolveFileReference,
      handleResolveFileReferenceCandidates,
    ],
  );

  const stateTimelineSectionProps = useMemo(
    () => ({
      state: {
        timeline: stateTimeline,
        timelineScope,
        timelineRange,
        hasRepoTimeline,
        timelineError,
        timelineLoading,
        timelineExpanded,
        isMobile,
      },
      actions: {
        onTimelineScopeChange: setTimelineScope,
        onTimelineRangeChange: setTimelineRange,
        onTimelineRefresh: refreshTimeline,
        onToggleTimelineExpanded: toggleTimelineExpanded,
      },
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
    () => ({
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
        commitBranch: sessionBranch,
        virtualBranch,
      },
      actions: {
        onRefresh: refreshCommitLog,
        onLoadMore: loadMoreCommits,
        onToggleCommit: toggleCommit,
        onToggleCommitFile: toggleCommitFile,
        onCopyHash: copyHash,
        onClearVirtualBranch,
        onResolveFileReference: handleResolveFileReference,
        onResolveFileReferenceCandidates: handleResolveFileReferenceCandidates,
      },
    }),
    [
      commitLog,
      sessionBranch,
      virtualBranch,
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
      onClearVirtualBranch,
      handleResolveFileReference,
      handleResolveFileReferenceCandidates,
    ],
  );

  const notesSectionProps = useMemo(
    () => ({
      state: {
        repoRoot,
        notes: repoNotes,
        notesLoading,
        notesError,
        creatingNote,
        savingNoteId,
        deletingNoteId,
      },
      actions: {
        onRefresh: refreshNotes,
        onCreate: createNote,
        onSave: saveNote,
        onDelete: removeNote,
      },
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
