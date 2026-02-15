import { useCallback, useMemo } from "react";

import { sumFileStats } from "../sessionDetailUtils";
import type { SessionDetailViewProps } from "../SessionDetailView";
import {
  buildFileContentModalProps,
  buildFileNavigatorSectionProps,
  buildLogFileCandidateModalProps,
  buildScreenPanelProps,
} from "./section-props-builders";

export const useSessionDetailViewExplorerSectionProps = ({
  meta,
  sidebar,
  screen,
  controls,
  files,
  diffs,
}: SessionDetailViewProps) => {
  const { paneId, session, connectionIssue } = meta;
  const { resolvedTheme } = sidebar;
  const {
    mode,
    screenLines,
    imageBase64,
    fallbackReason,
    error,
    pollingPauseReason,
    contextLeftLabel,
    isScreenLoading,
    isAtBottom,
    handleAtBottomChange,
    handleUserScrollStateChange,
    forceFollow,
    scrollToBottom,
    handleModeChange,
    virtuosoRef,
    scrollerRef,
    handleRefreshScreen,
    effectiveBranch = null,
    effectiveWorktreePath = null,
    worktreeRepoRoot = null,
    worktreeBaseBranch = null,
    worktreeSelectorEnabled = false,
    worktreeSelectorLoading = false,
    worktreeSelectorError = null,
    worktreeEntries = [],
    actualWorktreePath = null,
    virtualWorktreePath = null,
    selectVirtualWorktree,
    clearVirtualWorktree,
  } = screen;
  const sourceRepoRoot = effectiveWorktreePath ?? session?.repoRoot ?? null;
  const { diffSummary, diffError, diffFiles, diffLoadingFiles, ensureDiffFile } = diffs;
  const { rawMode, allowDangerKeys } = controls;
  const {
    unavailable,
    selectedFilePath,
    searchQuery,
    searchActiveIndex,
    searchResult,
    searchLoading,
    searchError,
    searchMode,
    treeLoading,
    treeError,
    treeNodes,
    rootTreeHasMore,
    searchHasMore,
    fileModalOpen,
    fileModalPath,
    fileModalLoading,
    fileModalError,
    fileModalFile,
    fileModalMarkdownViewMode,
    fileModalShowLineNumbers,
    fileModalCopiedPath,
    fileModalCopyError,
    fileModalHighlightLine,
    fileResolveError,
    logFileCandidateModalOpen,
    logFileCandidateReference,
    logFileCandidateItems,
    onSearchQueryChange,
    onSearchMove,
    onSearchConfirm,
    onToggleDirectory,
    onSelectFile,
    onOpenFileModal,
    onCloseFileModal,
    onSetFileModalMarkdownViewMode,
    onToggleFileModalLineNumbers,
    onCopyFileModalPath,
    onResolveLogFileReference,
    onResolveLogFileReferenceCandidates,
    onSelectLogFileCandidate,
    onCloseLogFileCandidateModal,
    onLoadMoreTreeRoot,
    onLoadMoreSearch,
  } = files;
  const diffPathSet = useMemo(
    () => new Set(diffSummary?.files.map((file) => file.path) ?? []),
    [diffSummary],
  );
  const fileModalDiffAvailable = fileModalPath != null && diffPathSet.has(fileModalPath);
  const fileModalDiffPatch = fileModalPath ? (diffFiles[fileModalPath]?.patch ?? null) : null;
  const fileModalDiffBinary = fileModalPath ? Boolean(diffFiles[fileModalPath]?.binary) : false;
  const fileModalDiffLoading = fileModalPath ? Boolean(diffLoadingFiles[fileModalPath]) : false;
  const fileModalDiffError = fileModalDiffAvailable ? diffError : null;
  const onLoadFileModalDiff = useCallback(
    (path: string) => {
      if (!diffPathSet.has(path)) {
        return;
      }
      void ensureDiffFile(path);
    },
    [diffPathSet, ensureDiffFile],
  );
  const promptGitContext = useMemo(() => {
    const totals = sumFileStats(diffSummary?.files);
    const fileChanges = diffSummary
      ? diffSummary.files.reduce(
          (counts, file) => {
            if (file.status === "A") {
              counts.add += 1;
              return counts;
            }
            if (file.status === "?") {
              counts.add += 1;
              return counts;
            }
            if (file.status === "D") {
              counts.d += 1;
              return counts;
            }
            counts.m += 1;
            return counts;
          },
          { add: 0, m: 0, d: 0 },
        )
      : null;
    return {
      branch: effectiveBranch ?? session?.branch ?? null,
      fileChanges,
      additions: totals?.additions ?? null,
      deletions: totals?.deletions ?? null,
    };
  }, [diffSummary, effectiveBranch, session?.branch]);

  const fileNavigatorSectionProps = useMemo(
    () =>
      buildFileNavigatorSectionProps({
        unavailable,
        selectedFilePath,
        searchQuery,
        searchActiveIndex,
        searchResult,
        searchLoading,
        searchError,
        searchMode,
        treeLoading,
        treeError,
        treeNodes,
        rootTreeHasMore,
        searchHasMore,
        onSearchQueryChange,
        onSearchMove,
        onSearchConfirm,
        onToggleDirectory,
        onSelectFile,
        onOpenFileModal,
        onLoadMoreTreeRoot,
        onLoadMoreSearch,
      }),
    [
      unavailable,
      selectedFilePath,
      searchQuery,
      searchActiveIndex,
      searchResult,
      searchLoading,
      searchError,
      searchMode,
      treeLoading,
      treeError,
      treeNodes,
      rootTreeHasMore,
      searchHasMore,
      onSearchQueryChange,
      onSearchMove,
      onSearchConfirm,
      onToggleDirectory,
      onSelectFile,
      onOpenFileModal,
      onLoadMoreTreeRoot,
      onLoadMoreSearch,
    ],
  );

  const fileContentModalProps = useMemo(
    () =>
      buildFileContentModalProps({
        fileModalOpen,
        fileModalPath,
        fileModalLoading,
        fileModalError,
        fileModalFile,
        fileModalMarkdownViewMode,
        fileModalDiffAvailable,
        fileModalDiffLoading,
        fileModalDiffPatch,
        fileModalDiffBinary,
        fileModalDiffError,
        fileModalShowLineNumbers,
        fileModalCopiedPath,
        fileModalCopyError,
        fileModalHighlightLine,
        resolvedTheme,
        onCloseFileModal,
        onToggleFileModalLineNumbers,
        onCopyFileModalPath,
        onSetFileModalMarkdownViewMode,
        onLoadFileModalDiff,
      }),
    [
      fileModalOpen,
      fileModalPath,
      fileModalLoading,
      fileModalError,
      fileModalFile,
      fileModalMarkdownViewMode,
      fileModalDiffAvailable,
      fileModalDiffLoading,
      fileModalDiffPatch,
      fileModalDiffBinary,
      fileModalDiffError,
      fileModalShowLineNumbers,
      fileModalCopiedPath,
      fileModalCopyError,
      fileModalHighlightLine,
      resolvedTheme,
      onCloseFileModal,
      onToggleFileModalLineNumbers,
      onCopyFileModalPath,
      onSetFileModalMarkdownViewMode,
      onLoadFileModalDiff,
    ],
  );

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

  const screenPanelProps = useMemo(
    () =>
      buildScreenPanelProps({
        mode,
        connectionIssue,
        fallbackReason,
        error,
        pollingPauseReason,
        promptGitContext,
        contextLeftLabel,
        isScreenLoading,
        imageBase64,
        screenLines,
        virtuosoRef,
        scrollerRef,
        isAtBottom,
        forceFollow,
        rawMode,
        allowDangerKeys,
        fileResolveError,
        worktreeSelectorEnabled,
        worktreeSelectorLoading,
        worktreeSelectorError,
        worktreeEntries,
        worktreeRepoRoot,
        worktreeBaseBranch,
        actualWorktreePath,
        virtualWorktreePath,
        handleModeChange,
        handleRefreshScreen,
        handleAtBottomChange,
        scrollToBottom,
        handleUserScrollStateChange,
        onSelectVirtualWorktree: selectVirtualWorktree,
        onClearVirtualWorktree: clearVirtualWorktree,
        onResolveFileReference: handleResolveFileReference,
        onResolveFileReferenceCandidates: handleResolveFileReferenceCandidates,
      }),
    [
      mode,
      connectionIssue,
      fallbackReason,
      error,
      pollingPauseReason,
      promptGitContext,
      contextLeftLabel,
      isScreenLoading,
      imageBase64,
      screenLines,
      virtuosoRef,
      scrollerRef,
      isAtBottom,
      forceFollow,
      rawMode,
      allowDangerKeys,
      fileResolveError,
      worktreeSelectorEnabled,
      worktreeSelectorLoading,
      worktreeSelectorError,
      worktreeEntries,
      worktreeRepoRoot,
      worktreeBaseBranch,
      actualWorktreePath,
      virtualWorktreePath,
      handleModeChange,
      handleRefreshScreen,
      handleAtBottomChange,
      scrollToBottom,
      handleUserScrollStateChange,
      selectVirtualWorktree,
      clearVirtualWorktree,
      handleResolveFileReference,
      handleResolveFileReferenceCandidates,
    ],
  );

  const logFileCandidateModalProps = useMemo(
    () =>
      buildLogFileCandidateModalProps({
        logFileCandidateModalOpen,
        logFileCandidateReference,
        logFileCandidateItems,
        onCloseLogFileCandidateModal,
        onSelectLogFileCandidate,
      }),
    [
      logFileCandidateModalOpen,
      logFileCandidateReference,
      logFileCandidateItems,
      onCloseLogFileCandidateModal,
      onSelectLogFileCandidate,
    ],
  );

  return {
    fileNavigatorSectionProps,
    fileContentModalProps,
    screenPanelProps,
    logFileCandidateModalProps,
  };
};
