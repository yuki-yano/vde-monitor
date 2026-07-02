import { useCallback, useMemo } from "react";

import { usePushNotifications } from "@/features/notifications/use-push-notifications";

import { useSessionBranches } from "./hooks/useSessionBranches";
import { useSessionCommits } from "./hooks/useSessionCommits";
import { useSessionDetailLayoutState } from "./hooks/useSessionDetailLayoutState";
import { useSessionDetailScreenControls } from "./hooks/useSessionDetailScreenControls";
import { useSessionDetailTimelineLogsActions } from "./hooks/useSessionDetailTimelineLogsActions";
import { useSessionDetailVMState } from "./hooks/useSessionDetailVMState";
import { useSessionDiffs } from "./hooks/useSessionDiffs";
import { useSessionFiles } from "./hooks/useSessionFiles";
import { useSessionRepoNotes } from "./hooks/useSessionRepoNotes";
import { useSessionRepoPins } from "./hooks/useSessionRepoPins";
import { useSessionTitleEditor } from "./hooks/useSessionTitleEditor";
import { useSessionVirtualBranch } from "./hooks/useSessionVirtualBranch";
import { useSessionVirtualWorktree } from "./hooks/useSessionVirtualWorktree";
import { extractCodexContextLeft } from "./sessionDetailUtils";

export const useSessionDetailVM = (paneId: string) => {
  const pushNotifications = usePushNotifications({ paneId });

  const {
    sessions,
    token,
    apiBaseUrl,
    connected,
    connectionStatus,
    connectionIssue,
    highlightCorrections,
    fileNavigatorConfig,
    launchConfig,
    resolvedTheme,
    session,
    screenText,
    nowMs,
    requestCommitDetail,
    requestCommitFile,
    requestCommitLog,
    requestWorktrees,
    requestBranches,
    requestBranchCheckout,
    requestBranchCreate,
    requestBranchDelete,
    requestDiffFile,
    requestDiffSummary,
    requestRepoNotes,
    requestRepoFileContent,
    requestRepoFileSearch,
    requestRepoFileTree,
    requestStateTimeline,
    requestScreen,
    focusPane,
    killPane,
    killWindow,
    refreshSessions,
    launchAgentInSession,
    uploadImageAttachment,
    sendText,
    sendKeys,
    sendRaw,
    touchSession,
    updateSessionTitle,
    resetSessionTitle,
    createRepoNote,
    updateRepoNote,
    deleteRepoNote,
  } = useSessionDetailVMState(paneId);

  const { getRepoSortAnchorAt, paneRepoRootMap, touchRepoSortAnchor, sessionGroups } =
    useSessionRepoPins({
      sessions,
    });

  const {
    screen: {
      mode,
      wrapMode,
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
      toggleWrapMode,
      virtuosoRef,
      scrollerRef,
    },
    controls: {
      textInputRef,
      autoEnter,
      shiftHeld,
      ctrlHeld,
      rawMode,
      allowDangerKeys,
      isSendingText,
      handleSendKey,
      handleSendPermissionShortcut,
      handleKillPane,
      handleKillWindow,
      handleSendText,
      handleUploadImage,
      handleRawBeforeInput,
      handleRawInput,
      handleRawKeyDown,
      handleRawCompositionStart,
      handleRawCompositionEnd,
      toggleAutoEnter,
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
    resolvedTheme,
    sessionAgent: session?.agent ?? null,
    highlightCorrections,
    requestScreen,
    sendText,
    sendKeys,
    sendRaw,
    killPane,
    killWindow,
    uploadImageAttachment,
    apiBaseUrl,
    token,
  });

  const virtualWorktree = useSessionVirtualWorktree({
    paneId,
    session,
    requestWorktrees,
  });

  const branchesState = useSessionBranches({
    paneId,
    connected,
    session,
    requestBranches,
    requestBranchCheckout,
    requestBranchCreate,
    requestBranchDelete,
  });

  const virtualBranch = useSessionVirtualBranch({
    paneId,
    branchList: branchesState.branchList,
  });

  // 仮想 branch と仮想 worktree は排他
  const selectVirtualBranchExclusive = useCallback(
    (name: string) => {
      virtualWorktree.clearVirtualWorktree();
      virtualBranch.selectVirtualBranch(name);
    },
    [virtualBranch, virtualWorktree],
  );
  const selectVirtualWorktreeExclusive = useCallback(
    (path: string) => {
      virtualBranch.clearVirtualBranch();
      virtualWorktree.selectVirtualWorktree(path);
    },
    [virtualBranch, virtualWorktree],
  );

  const effectiveBranchScope = virtualBranch.virtualBranch;
  const effectiveWorktreeScope = effectiveBranchScope
    ? null
    : virtualWorktree.effectiveWorktreePath;

  const diffs = useSessionDiffs({
    paneId,
    connected,
    worktreePath: effectiveWorktreeScope,
    branch: effectiveBranchScope,
    requestDiffSummary,
    requestDiffFile,
  });

  const files = useSessionFiles({
    paneId,
    repoRoot: session?.repoRoot ?? null,
    worktreePath: virtualWorktree.effectiveWorktreePath,
    autoExpandMatchLimit: fileNavigatorConfig.autoExpandMatchLimit,
    requestRepoFileTree,
    requestRepoFileSearch,
    requestRepoFileContent,
  });

  const commits = useSessionCommits({
    paneId,
    connected,
    worktreePath: effectiveWorktreeScope,
    branch: effectiveBranchScope,
    requestCommitLog,
    requestCommitDetail,
    requestCommitFile,
  });

  const checkoutBranchAndClear = useCallback(
    async (name: string) => {
      const ok = await branchesState.checkoutBranch(name);
      if (ok) {
        virtualBranch.clearVirtualBranch();
        void diffs.refreshDiff();
        void commits.refreshCommitLog();
        void virtualWorktree.refreshWorktrees();
      }
      return ok;
    },
    [branchesState, commits, diffs, virtualBranch, virtualWorktree],
  );

  const createBranchAndRefresh = useCallback(
    async (name: string, base?: string) => {
      const ok = await branchesState.createBranch(name, base);
      if (ok) {
        void virtualWorktree.refreshWorktrees();
      }
      return ok;
    },
    [branchesState, virtualWorktree],
  );

  const deleteBranchAndRefresh = useCallback(
    async (name: string, options?: { force?: boolean }) => {
      const ok = await branchesState.deleteBranch(name, options);
      if (ok) {
        void virtualWorktree.refreshWorktrees();
      }
      return ok;
    },
    [branchesState, virtualWorktree],
  );

  const currentRepoRoot = session?.repoRoot ?? null;
  const {
    notes,
    notesLoading,
    notesError,
    creatingNote,
    savingNoteId,
    deletingNoteId,
    refreshNotes,
    createNote,
    saveNote,
    removeNote,
  } = useSessionRepoNotes({
    paneId,
    repoRoot: currentRepoRoot,
    connected,
    requestRepoNotes,
    createRepoNote,
    updateRepoNote,
    deleteRepoNote,
  });

  const {
    timeline: {
      timeline,
      timelineScope,
      timelineRange,
      hasRepoTimeline,
      timelineError,
      timelineLoading,
      timelineExpanded,
      setTimelineScope,
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
      handleOpenPaneInNewWindow,
      handleOpenInNewTab,
      handleFocusPane,
      handleOpenPaneHere,
      handleOpenHere,
      handleTouchRepoPin,
      handleLaunchAgentInSession,
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
    refreshSessions,
    launchAgentInSession,
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
    resetSessionTitle,
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
      launchConfig,
      requestWorktrees,
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
    },
    screen: {
      mode,
      wrapMode,
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
      toggleWrapMode,
      virtuosoRef,
      scrollerRef,
      handleRefreshScreen,
      handleRefreshWorktrees: virtualWorktree.refreshWorktrees,
      effectiveBranch: virtualWorktree.effectiveBranch,
      effectiveWorktreePath: virtualWorktree.effectiveWorktreePath,
      worktreeRepoRoot: virtualWorktree.repoRoot,
      worktreeBaseBranch: virtualWorktree.baseBranch,
      worktreeSelectorEnabled: virtualWorktree.selectorEnabled,
      worktreeSelectorLoading: virtualWorktree.loading,
      worktreeSelectorError: virtualWorktree.error,
      worktreeEntries: virtualWorktree.entries,
      actualWorktreePath: virtualWorktree.actualWorktreePath,
      virtualWorktreePath: virtualWorktree.virtualWorktreePath,
      selectVirtualWorktree: selectVirtualWorktreeExclusive,
      clearVirtualWorktree: virtualWorktree.clearVirtualWorktree,
      branches: branchesState.branches,
      branchRepoRoot: branchesState.branchList?.repoRoot ?? null,
      currentBranch: branchesState.currentBranch,
      virtualBranch: virtualBranch.virtualBranch,
      branchesLoading: branchesState.branchesLoading,
      branchesError: branchesState.branchesError,
      branchMutating: branchesState.mutating,
      branchMutationError: branchesState.mutationError,
      clearBranchMutationError: branchesState.clearMutationError,
      refreshBranches: branchesState.refreshBranches,
      checkoutBranch: checkoutBranchAndClear,
      createBranch: createBranchAndRefresh,
      deleteBranch: deleteBranchAndRefresh,
      selectVirtualBranch: selectVirtualBranchExclusive,
      clearVirtualBranch: virtualBranch.clearVirtualBranch,
      notificationStatus: pushNotifications.status,
      notificationPushEnabled: pushNotifications.pushEnabled,
      notificationSubscribed: pushNotifications.isSubscribed,
      notificationPaneEnabled: pushNotifications.isPaneEnabled,
      requestNotificationPermission: pushNotifications.requestPermissionAndSubscribe,
      togglePaneNotification: pushNotifications.togglePaneEnabled,
    },
    controls: {
      interactive: connectionStatus !== "disconnected",
      textInputRef,
      autoEnter,
      shiftHeld,
      ctrlHeld,
      rawMode,
      allowDangerKeys,
      isSendingText,
      handleSendKey,
      handleSendPermissionShortcut,
      handleKillPane,
      handleKillWindow,
      handleSendText,
      handleUploadImage,
      handleRawBeforeInput,
      handleRawInput,
      handleRawKeyDown,
      handleRawCompositionStart,
      handleRawCompositionEnd,
      toggleAutoEnter,
      toggleShift,
      toggleCtrl,
      toggleRawMode,
      toggleAllowDangerKeys,
      handleTouchSession: handleTouchCurrentSession,
    },
    diffs,
    files,
    commits,
    notes: {
      repoRoot: currentRepoRoot,
      notes,
      notesLoading,
      notesError,
      creatingNote,
      savingNoteId,
      deletingNoteId,
      refreshNotes,
      createNote,
      saveNote,
      removeNote,
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
      resetTitle,
    },
    actions: {
      handleFocusPane,
      handleTouchRepoPin,
      handleLaunchAgentInSession,
      handleOpenPaneHere,
      handleOpenPaneInNewWindow,
      handleOpenHere,
      handleOpenInNewTab,
      handleTouchPane: handleTouchPaneWithRepoAnchor,
    },
  };
};

export type SessionDetailVM = ReturnType<typeof useSessionDetailVM>;
