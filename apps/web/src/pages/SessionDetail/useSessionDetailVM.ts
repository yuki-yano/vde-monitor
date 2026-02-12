import { useMemo } from "react";

import {
  buildActionsSection,
  buildCommitsSection,
  buildControlsSection,
  buildFilesSection,
  buildLayoutSection,
  buildLogsSection,
  buildMetaSection,
  buildScreenSection,
  buildSidebarSection,
  buildTimelineSection,
  buildTitleSection,
} from "./hooks/session-detail-vm-section-builders";
import { useSessionCommits } from "./hooks/useSessionCommits";
import { useSessionDetailLayoutState } from "./hooks/useSessionDetailLayoutState";
import { useSessionDetailScreenControls } from "./hooks/useSessionDetailScreenControls";
import { useSessionDetailTimelineLogsActions } from "./hooks/useSessionDetailTimelineLogsActions";
import { useSessionDetailVMState } from "./hooks/useSessionDetailVMState";
import { useSessionDiffs } from "./hooks/useSessionDiffs";
import { useSessionFiles } from "./hooks/useSessionFiles";
import { useSessionRepoPins } from "./hooks/useSessionRepoPins";
import { useSessionTitleEditor } from "./hooks/useSessionTitleEditor";
import { extractCodexContextLeft } from "./sessionDetailUtils";

export const useSessionDetailVM = (paneId: string) => {
  const {
    sessions,
    connected,
    connectionStatus,
    connectionIssue,
    highlightCorrections,
    fileNavigatorConfig,
    resolvedTheme,
    session,
    screenText,
    nowMs,
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
  } = useSessionDetailVMState();

  const { getRepoSortAnchorAt, paneRepoRootMap, touchRepoSortAnchor, sessionGroups } =
    useSessionRepoPins({
      sessions,
    });

  const {
    screen: {
      mode,
      screenLines,
      imageBase64,
      fallbackReason,
      error,
      setScreenError,
      isScreenLoading,
      pollingPauseReason,
      isAtBottom,
      handleAtBottomChange,
      handleUserScrollStateChange,
      forceFollow,
      scrollToBottom,
      handleModeChange,
      virtuosoRef,
      scrollerRef,
    },
    controls: {
      textInputRef,
      autoEnter,
      shiftHeld,
      ctrlHeld,
      controlsOpen,
      rawMode,
      allowDangerKeys,
      isSendingText,
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
    },
    handleRefreshScreen,
  } = useSessionDetailScreenControls({
    paneId,
    connected,
    connectionIssue,
    requestScreen,
    sendText,
    sendKeys,
    sendRaw,
    uploadImageAttachment,
  });

  const diffs = useSessionDiffs({
    paneId,
    connected,
    requestDiffSummary,
    requestDiffFile,
  });

  const files = useSessionFiles({
    paneId,
    repoRoot: session?.repoRoot ?? null,
    autoExpandMatchLimit: fileNavigatorConfig.autoExpandMatchLimit,
    requestRepoFileTree,
    requestRepoFileSearch,
    requestRepoFileContent,
  });

  const commits = useSessionCommits({
    paneId,
    connected,
    requestCommitLog,
    requestCommitDetail,
    requestCommitFile,
  });

  const currentRepoRoot = session?.repoRoot ?? null;
  const {
    timeline: {
      timeline,
      timelineRange,
      timelineError,
      timelineLoading,
      timelineExpanded,
      setTimelineRange,
      toggleTimelineExpanded,
      refreshTimeline,
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
    actions: {
      handleOpenInNewTab,
      handleFocusPane,
      handleOpenPaneHere,
      handleOpenHere,
      handleTouchRepoPin,
      handleTouchCurrentSession,
      handleTouchPaneWithRepoAnchor,
    },
  } = useSessionDetailTimelineLogsActions({
    paneId,
    connected,
    connectionIssue,
    requestScreen,
    requestStateTimeline,
    sessions,
    resolvedTheme,
    highlightCorrections,
    touchSession,
    focusPane,
    setScreenError,
    touchRepoSortAnchor,
    paneRepoRootMap,
    currentRepoRoot,
  });

  const {
    titleDraft,
    titleEditing,
    titleSaving,
    titleError,
    openTitleEditor,
    closeTitleEditor,
    updateTitleDraft,
    saveTitle,
    resetTitle,
  } = useSessionTitleEditor({
    session,
    paneId,
    updateSessionTitle,
  });

  const contextLeftLabel = useMemo(
    () => (session?.agent === "codex" ? extractCodexContextLeft(screenText) : null),
    [screenText, session?.agent],
  );
  const {
    is2xlUp,
    isMobile,
    sidebarWidth,
    handleSidebarPointerDown,
    detailSplitRatio,
    detailSplitRef,
    handleDetailSplitPointerDown,
  } = useSessionDetailLayoutState();

  return {
    meta: buildMetaSection({
      paneId,
      session,
      nowMs,
      connected,
      connectionIssue,
    }),
    sidebar: buildSidebarSection({
      sessionGroups,
      getRepoSortAnchorAt,
      connected,
      connectionIssue,
      requestStateTimeline,
      requestScreen,
      highlightCorrections,
      resolvedTheme,
    }),
    layout: buildLayoutSection({
      is2xlUp,
      sidebarWidth,
      handleSidebarPointerDown,
      detailSplitRatio,
      detailSplitRef,
      handleDetailSplitPointerDown,
    }),
    timeline: buildTimelineSection({
      timeline,
      timelineRange,
      timelineError,
      timelineLoading,
      timelineExpanded,
      isMobile,
      setTimelineRange,
      toggleTimelineExpanded,
      refreshTimeline,
    }),
    screen: buildScreenSection({
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
    }),
    controls: buildControlsSection({
      interactive: connectionStatus !== "disconnected",
      textInputRef,
      autoEnter,
      shiftHeld,
      ctrlHeld,
      controlsOpen,
      rawMode,
      allowDangerKeys,
      isSendingText,
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
      handleTouchCurrentSession,
    }),
    diffs,
    files: buildFilesSection(files),
    commits: buildCommitsSection(commits),
    logs: buildLogsSection({
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
    }),
    title: buildTitleSection({
      titleDraft,
      titleEditing,
      titleSaving,
      titleError,
      openTitleEditor,
      closeTitleEditor,
      updateTitleDraft,
      saveTitle,
      resetTitle,
    }),
    actions: buildActionsSection({
      handleFocusPane,
      handleTouchRepoPin,
      handleOpenPaneHere,
      handleOpenHere,
      handleOpenInNewTab,
      handleTouchPaneWithRepoAnchor,
    }),
  };
};

export type SessionDetailVM = ReturnType<typeof useSessionDetailVM>;
