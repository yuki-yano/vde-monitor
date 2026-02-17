import { useMemo } from "react";

import type { SessionDetailViewShellSectionsInput } from "./session-detail-view-contract";

export const useSessionDetailViewShellSectionProps = ({
  meta,
  sidebar,
  controls,
  logs,
  title,
  actions,
}: SessionDetailViewShellSectionsInput) => {
  const { paneId, session, nowMs, connectionIssue } = meta;
  const {
    sessionGroups,
    getRepoSortAnchorAt,
    connected,
    connectionIssue: sidebarConnectionIssue,
    launchConfig,
    requestWorktrees,
    requestStateTimeline,
    requestScreen,
    highlightCorrections,
    resolvedTheme,
  } = sidebar;
  const {
    textInputRef,
    autoEnter,
    shiftHeld,
    ctrlHeld,
    rawMode,
    allowDangerKeys,
    isSendingText,
    interactive,
    handleSendKey,
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
    handleTouchSession,
  } = controls;
  const {
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
  } = logs;
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
  } = title;
  const {
    handleFocusPane,
    handleLaunchAgentInSession,
    handleTouchPane,
    handleTouchRepoPin,
    handleOpenPaneHere,
    handleOpenPaneInNewWindow,
    handleOpenHere,
    handleOpenInNewTab,
  } = actions;

  const quickPanelProps = useMemo(
    () => ({
      state: {
        open: quickPanelOpen,
        sessionGroups,
        allSessions: sessionGroups.flatMap((group) => group.sessions),
        nowMs,
        currentPaneId: paneId,
      },
      actions: {
        onOpenLogModal: openLogModal,
        onOpenSessionLink: handleOpenPaneHere,
        onOpenSessionLinkInNewWindow: handleOpenPaneInNewWindow,
        onClose: closeQuickPanel,
        onToggle: toggleQuickPanel,
      },
    }),
    [
      quickPanelOpen,
      sessionGroups,
      nowMs,
      paneId,
      openLogModal,
      handleOpenPaneHere,
      handleOpenPaneInNewWindow,
      closeQuickPanel,
      toggleQuickPanel,
    ],
  );

  const logModalProps = useMemo(
    () => ({
      state: {
        open: logModalOpen,
        session: selectedSession,
        logLines: selectedLogLines,
        loading: selectedLogLoading,
        error: selectedLogError,
      },
      actions: {
        onClose: closeLogModal,
        onOpenHere: handleOpenHere,
        onOpenNewTab: handleOpenInNewTab,
      },
    }),
    [
      logModalOpen,
      selectedSession,
      selectedLogLines,
      selectedLogLoading,
      selectedLogError,
      closeLogModal,
      handleOpenHere,
      handleOpenInNewTab,
    ],
  );

  const sessionHeaderProps = useMemo(() => {
    if (!session) {
      return null;
    }

    return {
      state: {
        session,
        connectionIssue,
        nowMs,
        titleDraft,
        titleEditing,
        titleSaving,
        titleError,
      },
      actions: {
        onTitleDraftChange: updateTitleDraft,
        onTitleSave: saveTitle,
        onTitleReset: resetTitle,
        onOpenTitleEditor: openTitleEditor,
        onCloseTitleEditor: closeTitleEditor,
        onTouchSession: handleTouchSession,
      },
    };
  }, [
    session,
    connectionIssue,
    nowMs,
    titleDraft,
    titleEditing,
    titleSaving,
    titleError,
    updateTitleDraft,
    saveTitle,
    resetTitle,
    openTitleEditor,
    closeTitleEditor,
    handleTouchSession,
  ]);

  const sessionSidebarProps = useMemo(
    () => ({
      state: {
        sessionGroups,
        getRepoSortAnchorAt,
        nowMs,
        connected,
        connectionIssue: sidebarConnectionIssue,
        launchConfig,
        requestWorktrees,
        requestStateTimeline,
        requestScreen,
        highlightCorrections,
        resolvedTheme,
        currentPaneId: paneId,
        className: "border-latte-surface1/80 h-full w-full rounded-none rounded-r-3xl border-r",
      },
      actions: {
        onFocusPane: handleFocusPane,
        onLaunchAgentInSession: handleLaunchAgentInSession,
        onTouchSession: handleTouchPane,
        onTouchRepoPin: handleTouchRepoPin,
      },
    }),
    [
      sessionGroups,
      getRepoSortAnchorAt,
      nowMs,
      connected,
      sidebarConnectionIssue,
      launchConfig,
      requestWorktrees,
      requestStateTimeline,
      requestScreen,
      highlightCorrections,
      resolvedTheme,
      paneId,
      handleFocusPane,
      handleLaunchAgentInSession,
      handleTouchPane,
      handleTouchRepoPin,
    ],
  );

  const controlsPanelProps = useMemo(
    () => ({
      state: {
        interactive,
        textInputRef,
        autoEnter,
        rawMode,
        allowDangerKeys,
        isSendingText,
        shiftHeld,
        ctrlHeld,
      },
      actions: {
        onSendText: handleSendText,
        onPickImage: handleUploadImage,
        onToggleAutoEnter: toggleAutoEnter,
        onToggleRawMode: toggleRawMode,
        onToggleAllowDangerKeys: toggleAllowDangerKeys,
        onToggleShift: toggleShift,
        onToggleCtrl: toggleCtrl,
        onSendKey: handleSendKey,
        onKillPane: handleKillPane,
        onKillWindow: handleKillWindow,
        onRawBeforeInput: handleRawBeforeInput,
        onRawInput: handleRawInput,
        onRawKeyDown: handleRawKeyDown,
        onRawCompositionStart: handleRawCompositionStart,
        onRawCompositionEnd: handleRawCompositionEnd,
      },
    }),
    [
      interactive,
      textInputRef,
      autoEnter,
      rawMode,
      allowDangerKeys,
      isSendingText,
      shiftHeld,
      ctrlHeld,
      handleSendText,
      handleUploadImage,
      toggleAutoEnter,
      toggleRawMode,
      toggleAllowDangerKeys,
      toggleShift,
      toggleCtrl,
      handleSendKey,
      handleKillPane,
      handleKillWindow,
      handleRawBeforeInput,
      handleRawInput,
      handleRawKeyDown,
      handleRawCompositionStart,
      handleRawCompositionEnd,
    ],
  );

  return {
    quickPanelProps,
    logModalProps,
    sessionHeaderProps,
    sessionSidebarProps,
    controlsPanelProps,
  };
};
