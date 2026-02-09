import { useAtomValue } from "jotai";
import { useCallback, useEffect, useMemo, useState } from "react";

import { buildSessionGroups } from "@/lib/session-group";
import { useMediaQuery } from "@/lib/use-media-query";
import { useNowMs } from "@/lib/use-now-ms";
import { useSidebarWidth } from "@/lib/use-sidebar-width";
import { useSplitRatio } from "@/lib/use-split-ratio";
import {
  createRepoPinKey,
  readStoredSessionListPins,
  storeSessionListPins,
  touchSessionListPin,
} from "@/pages/SessionList/sessionListPins";

import { screenTextAtom } from "./atoms/screenAtoms";
import {
  connectedAtom,
  connectionIssueAtom,
  connectionStatusAtom,
  currentSessionAtom,
  fileNavigatorConfigAtom,
  highlightCorrectionsAtom,
  resolvedThemeAtom,
  sessionApiAtom,
  sessionsAtom,
} from "./atoms/sessionDetailAtoms";
import { useSessionCommits } from "./hooks/useSessionCommits";
import { useSessionControls } from "./hooks/useSessionControls";
import { useSessionDetailActions } from "./hooks/useSessionDetailActions";
import { useSessionDiffs } from "./hooks/useSessionDiffs";
import { useSessionFiles } from "./hooks/useSessionFiles";
import { useSessionLogs } from "./hooks/useSessionLogs";
import { useSessionScreen } from "./hooks/useSessionScreen";
import { useSessionTimeline } from "./hooks/useSessionTimeline";
import { useSessionTitleEditor } from "./hooks/useSessionTitleEditor";
import { extractCodexContextLeft } from "./sessionDetailUtils";

export const useSessionDetailVM = (paneId: string) => {
  const sessions = useAtomValue(sessionsAtom);
  const connected = useAtomValue(connectedAtom);
  const connectionStatus = useAtomValue(connectionStatusAtom);
  const connectionIssue = useAtomValue(connectionIssueAtom);
  const highlightCorrections = useAtomValue(highlightCorrectionsAtom);
  const fileNavigatorConfig = useAtomValue(fileNavigatorConfigAtom);
  const resolvedTheme = useAtomValue(resolvedThemeAtom);
  const session = useAtomValue(currentSessionAtom);
  const screenText = useAtomValue(screenTextAtom);
  const sessionApi = useAtomValue(sessionApiAtom);
  if (!sessionApi) {
    throw new Error("SessionDetailProvider is required");
  }
  const {
    requestCommitDetail,
    requestCommitFile,
    requestCommitLog,
    requestDiffFile,
    requestDiffSummary,
    requestRepoFileContent,
    requestRepoFileSearch,
    requestRepoFileTree,
    requestStateTimeline,
    requestScreen,
    focusPane,
    uploadImageAttachment,
    sendText,
    sendKeys,
    sendRaw,
    touchSession,
    updateSessionTitle,
  } = sessionApi;
  const nowMs = useNowMs();
  const [pins, setPins] = useState(() => readStoredSessionListPins());
  const repoPinValues = pins.repos;

  useEffect(() => {
    storeSessionListPins(pins);
  }, [pins]);

  const getRepoSortAnchorAt = useCallback(
    (repoRoot: string | null) => repoPinValues[createRepoPinKey(repoRoot)] ?? null,
    [repoPinValues],
  );
  const paneRepoRootMap = useMemo(
    () =>
      new Map(
        sessions.map((sessionItem) => [sessionItem.paneId, sessionItem.repoRoot ?? null] as const),
      ),
    [sessions],
  );
  const touchRepoSortAnchor = useCallback((repoRoot: string | null) => {
    setPins((prev) => touchSessionListPin(prev, "repos", createRepoPinKey(repoRoot)));
  }, []);

  const {
    mode,
    screenLines,
    imageBase64,
    fallbackReason,
    error,
    setScreenError,
    isScreenLoading,
    isAtBottom,
    handleAtBottomChange,
    handleUserScrollStateChange,
    forceFollow,
    refreshScreen,
    scrollToBottom,
    handleModeChange,
    virtuosoRef,
    scrollerRef,
  } = useSessionScreen({
    paneId,
    connected,
    connectionIssue,
    requestScreen,
  });

  const {
    textInputRef,
    autoEnter,
    shiftHeld,
    ctrlHeld,
    controlsOpen,
    rawMode,
    allowDangerKeys,
    handleSendKey,
    handleSendText,
    handleUploadImage,
    handleRawBeforeInput,
    handleRawInput,
    handleRawKeyDown,
    handleRawCompositionStart,
    handleRawCompositionEnd,
    toggleAutoEnter,
    toggleControls,
    toggleShift,
    toggleCtrl,
    toggleRawMode,
    toggleAllowDangerKeys,
  } = useSessionControls({
    paneId,
    mode,
    sendText,
    sendKeys,
    sendRaw,
    uploadImageAttachment,
    setScreenError,
    scrollToBottom,
  });

  const {
    diffSummary,
    diffError,
    diffLoading,
    diffFiles,
    diffOpen,
    diffLoadingFiles,
    refreshDiff,
    toggleDiff,
  } = useSessionDiffs({
    paneId,
    connected,
    requestDiffSummary,
    requestDiffFile,
  });

  const {
    unavailable: filesUnavailable,
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
    onLoadMoreTreeRoot,
    onLoadMoreSearch,
  } = useSessionFiles({
    paneId,
    repoRoot: session?.repoRoot ?? null,
    autoExpandMatchLimit: fileNavigatorConfig.autoExpandMatchLimit,
    requestRepoFileTree,
    requestRepoFileSearch,
    requestRepoFileContent,
  });

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
  } = useSessionCommits({
    paneId,
    connected,
    requestCommitLog,
    requestCommitDetail,
    requestCommitFile,
  });

  const {
    quickPanelOpen,
    logModalOpen,
    selectedPaneId,
    selectedSession,
    selectedLogLines,
    selectedLogLoading,
    selectedLogError,
    openLogModal,
    closeLogModal,
    toggleQuickPanel,
    closeQuickPanel,
  } = useSessionLogs({
    connected,
    connectionIssue,
    sessions,
    requestScreen,
    resolvedTheme,
    highlightCorrections,
  });

  const {
    handleOpenInNewTab,
    handleTouchSession,
    handleTouchPane,
    handleFocusPane,
    handleOpenPaneHere,
    handleOpenHere,
  } = useSessionDetailActions({
    paneId,
    selectedPaneId,
    closeQuickPanel,
    closeLogModal,
    touchSession,
    focusPane,
    setScreenError,
  });
  const currentRepoRoot = session?.repoRoot ?? null;
  const handleTouchRepoPin = useCallback(
    (repoRoot: string | null) => {
      touchRepoSortAnchor(repoRoot);
    },
    [touchRepoSortAnchor],
  );
  const handleTouchCurrentSession = useCallback(() => {
    touchRepoSortAnchor(currentRepoRoot);
    handleTouchSession();
  }, [touchRepoSortAnchor, currentRepoRoot, handleTouchSession]);
  const handleTouchPaneWithRepoAnchor = useCallback(
    (targetPaneId: string) => {
      touchRepoSortAnchor(paneRepoRootMap.get(targetPaneId) ?? null);
      handleTouchPane(targetPaneId);
    },
    [touchRepoSortAnchor, paneRepoRootMap, handleTouchPane],
  );

  const {
    titleDraft,
    titleEditing,
    titleSaving,
    titleError,
    openTitleEditor,
    closeTitleEditor,
    updateTitleDraft,
    saveTitle,
    clearTitle,
  } = useSessionTitleEditor({
    session,
    paneId,
    updateSessionTitle,
  });

  const sessionGroups = useMemo(
    () => buildSessionGroups(sessions, { getRepoSortAnchorAt }),
    [sessions, getRepoSortAnchorAt],
  );
  const contextLeftLabel = useMemo(
    () => (session?.agent === "codex" ? extractCodexContextLeft(screenText) : null),
    [screenText, session?.agent],
  );
  const is2xlUp = useMediaQuery("(min-width: 1536px)");
  const isMobile = useMediaQuery("(max-width: 767px)");

  const {
    timeline,
    timelineRange,
    timelineError,
    timelineLoading,
    timelineExpanded,
    setTimelineRange,
    toggleTimelineExpanded,
    refreshTimeline,
  } = useSessionTimeline({
    paneId,
    connected,
    requestStateTimeline,
    mobileDefaultCollapsed: true,
  });

  const { sidebarWidth, handlePointerDown: handleSidebarPointerDown } = useSidebarWidth();
  const {
    ratio: detailSplitRatio,
    containerRef: detailSplitRef,
    handlePointerDown: handleDetailSplitPointerDown,
  } = useSplitRatio({
    storageKey: "vde.detail.split",
    defaultRatio: 0.5,
    minRatio: 0.35,
    maxRatio: 0.65,
  });

  const handleRefreshScreen = () => {
    void refreshScreen();
  };

  return {
    meta: {
      paneId,
      session,
      nowMs,
      connected,
      connectionIssue,
    },
    sidebar: {
      sessionGroups,
      getRepoSortAnchorAt,
      connected,
      connectionIssue,
      requestStateTimeline,
      requestScreen,
      highlightCorrections,
      resolvedTheme,
    },
    layout: {
      is2xlUp,
      sidebarWidth,
      handleSidebarPointerDown,
      detailSplitRatio,
      detailSplitRef,
      handleDetailSplitPointerDown,
    },
    timeline: {
      timeline,
      timelineRange,
      timelineError,
      timelineLoading,
      timelineExpanded,
      isMobile,
      setTimelineRange,
      toggleTimelineExpanded,
      refreshTimeline,
    },
    screen: {
      mode,
      screenLines,
      imageBase64,
      fallbackReason,
      error,
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
    },
    controls: {
      interactive: connectionStatus !== "disconnected",
      textInputRef,
      autoEnter,
      shiftHeld,
      ctrlHeld,
      controlsOpen,
      rawMode,
      allowDangerKeys,
      handleSendKey,
      handleSendText,
      handleUploadImage,
      handleRawBeforeInput,
      handleRawInput,
      handleRawKeyDown,
      handleRawCompositionStart,
      handleRawCompositionEnd,
      toggleAutoEnter,
      toggleControls,
      toggleShift,
      toggleCtrl,
      toggleRawMode,
      toggleAllowDangerKeys,
      handleTouchSession: handleTouchCurrentSession,
    },
    diffs: {
      diffSummary,
      diffError,
      diffLoading,
      diffFiles,
      diffOpen,
      diffLoadingFiles,
      refreshDiff,
      toggleDiff,
    },
    files: {
      unavailable: filesUnavailable,
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
      onLoadMoreTreeRoot,
      onLoadMoreSearch,
    },
    commits: {
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
    },
    logs: {
      quickPanelOpen,
      logModalOpen,
      selectedSession,
      selectedLogLines,
      selectedLogLoading,
      selectedLogError,
      openLogModal,
      closeLogModal,
      toggleQuickPanel,
      closeQuickPanel,
    },
    title: {
      titleDraft,
      titleEditing,
      titleSaving,
      titleError,
      openTitleEditor,
      closeTitleEditor,
      updateTitleDraft,
      saveTitle,
      clearTitle,
    },
    actions: {
      handleFocusPane,
      handleTouchPane: handleTouchPaneWithRepoAnchor,
      handleTouchRepoPin,
      handleOpenPaneHere,
      handleOpenHere,
      handleOpenInNewTab,
    },
  };
};

export type SessionDetailVM = ReturnType<typeof useSessionDetailVM>;
