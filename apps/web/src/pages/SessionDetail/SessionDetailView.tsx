import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { type CSSProperties, useMemo } from "react";

import { Card } from "@/components/ui";

import { CommitSection } from "./components/CommitSection";
import { ControlsPanel } from "./components/ControlsPanel";
import { DiffSection } from "./components/DiffSection";
import { LogModal } from "./components/LogModal";
import { QuickPanel } from "./components/QuickPanel";
import { ScreenPanel } from "./components/ScreenPanel";
import { SessionHeader } from "./components/SessionHeader";
import { SessionSidebar } from "./components/SessionSidebar";
import { backLinkClass } from "./sessionDetailUtils";
import type { SessionDetailVM } from "./useSessionDetailVM";

export type SessionDetailViewProps = SessionDetailVM;

export const SessionDetailView = ({
  meta,
  sidebar,
  layout,
  screen,
  controls,
  diffs,
  commits,
  logs,
  title,
  actions,
}: SessionDetailViewProps) => {
  const { paneId, session, nowMs, connected, connectionIssue, readOnly } = meta;
  const { sessionGroups } = sidebar;
  const {
    is2xlUp,
    sidebarWidth,
    handleSidebarPointerDown,
    detailSplitRatio,
    detailSplitRef,
    handleDetailSplitPointerDown,
  } = layout;
  const {
    mode,
    screenLines,
    imageBase64,
    fallbackReason,
    error,
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
  } = screen;
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
    handleTouchSession,
  } = controls;
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
    clearTitle,
  } = title;
  const { handleOpenHere, handleOpenInNewTab } = actions;

  const diffSectionProps = useMemo(
    () => ({
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
    }),
    [
      diffSummary,
      diffError,
      diffLoading,
      diffFiles,
      diffOpen,
      diffLoadingFiles,
      refreshDiff,
      toggleDiff,
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
      },
      actions: {
        onRefresh: refreshCommitLog,
        onLoadMore: loadMoreCommits,
        onToggleCommit: toggleCommit,
        onToggleCommitFile: toggleCommitFile,
        onCopyHash: copyHash,
      },
    }),
    [
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
    ],
  );

  const screenPanelProps = useMemo(
    () => ({
      state: {
        mode,
        connected,
        connectionIssue,
        fallbackReason,
        error,
        isScreenLoading,
        imageBase64,
        screenLines,
        virtuosoRef,
        scrollerRef,
        isAtBottom,
        forceFollow,
        rawMode,
        allowDangerKeys,
      },
      actions: {
        onModeChange: handleModeChange,
        onRefresh: handleRefreshScreen,
        onAtBottomChange: handleAtBottomChange,
        onScrollToBottom: scrollToBottom,
        onUserScrollStateChange: handleUserScrollStateChange,
      },
    }),
    [
      mode,
      connected,
      connectionIssue,
      fallbackReason,
      error,
      isScreenLoading,
      imageBase64,
      screenLines,
      virtuosoRef,
      scrollerRef,
      isAtBottom,
      forceFollow,
      rawMode,
      allowDangerKeys,
      handleModeChange,
      handleRefreshScreen,
      handleAtBottomChange,
      scrollToBottom,
      handleUserScrollStateChange,
    ],
  );

  const quickPanelProps = useMemo(
    () => ({
      state: {
        open: quickPanelOpen,
        sessionGroups,
        nowMs,
        currentPaneId: paneId,
      },
      actions: {
        onOpenLogModal: openLogModal,
        onClose: closeQuickPanel,
        onToggle: toggleQuickPanel,
      },
    }),
    [quickPanelOpen, sessionGroups, nowMs, paneId, openLogModal, closeQuickPanel, toggleQuickPanel],
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

  const sessionHeaderProps = useMemo(
    () => ({
      state: {
        session: session!,
        readOnly,
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
        onTitleClear: clearTitle,
        onOpenTitleEditor: openTitleEditor,
        onCloseTitleEditor: closeTitleEditor,
      },
    }),
    [
      session,
      readOnly,
      connectionIssue,
      nowMs,
      titleDraft,
      titleEditing,
      titleSaving,
      titleError,
      updateTitleDraft,
      saveTitle,
      clearTitle,
      openTitleEditor,
      closeTitleEditor,
    ],
  );

  const sessionSidebarProps = useMemo(
    () => ({
      state: {
        sessionGroups,
        nowMs,
        currentPaneId: paneId,
        className: "border-latte-surface1/80 h-full w-full rounded-none rounded-r-3xl border-r",
      },
      actions: {},
    }),
    [sessionGroups, nowMs, paneId],
  );

  const controlsPanelProps = useMemo(
    () => ({
      state: {
        readOnly,
        connected,
        textInputRef,
        autoEnter,
        controlsOpen,
        rawMode,
        allowDangerKeys,
        shiftHeld,
        ctrlHeld,
      },
      actions: {
        onSendText: handleSendText,
        onToggleAutoEnter: toggleAutoEnter,
        onToggleControls: toggleControls,
        onToggleRawMode: toggleRawMode,
        onToggleAllowDangerKeys: toggleAllowDangerKeys,
        onToggleShift: toggleShift,
        onToggleCtrl: toggleCtrl,
        onSendKey: handleSendKey,
        onRawBeforeInput: handleRawBeforeInput,
        onRawInput: handleRawInput,
        onRawKeyDown: handleRawKeyDown,
        onRawCompositionStart: handleRawCompositionStart,
        onRawCompositionEnd: handleRawCompositionEnd,
        onTouchSession: handleTouchSession,
      },
    }),
    [
      readOnly,
      connected,
      textInputRef,
      autoEnter,
      controlsOpen,
      rawMode,
      allowDangerKeys,
      shiftHeld,
      ctrlHeld,
      handleSendText,
      toggleAutoEnter,
      toggleControls,
      toggleRawMode,
      toggleAllowDangerKeys,
      toggleShift,
      toggleCtrl,
      handleSendKey,
      handleRawBeforeInput,
      handleRawInput,
      handleRawKeyDown,
      handleRawCompositionStart,
      handleRawCompositionEnd,
      handleTouchSession,
    ],
  );

  if (!session) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-6">
        <Card>
          <p className="text-latte-subtext0 text-sm">Session not found.</p>
          <Link to="/" className={`${backLinkClass} mt-4`}>
            <ArrowLeft className="h-4 w-4" />
            Back to list
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <>
      <div
        className="fixed left-0 top-0 z-40 hidden h-screen md:flex"
        style={{ width: `${sidebarWidth}px` }}
      >
        <SessionSidebar {...sessionSidebarProps} />
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize sidebar"
          className="absolute right-0 top-0 h-full w-2 cursor-col-resize touch-none"
          onPointerDown={handleSidebarPointerDown}
        />
      </div>

      <div
        className="animate-fade-in-up w-full px-4 py-6 md:pl-[calc(var(--sidebar-width)+32px)] md:pr-6"
        style={{ "--sidebar-width": `${sidebarWidth}px` } as CSSProperties}
      >
        <div className="flex min-w-0 flex-col gap-4">
          <SessionHeader {...sessionHeaderProps} />

          <div
            ref={detailSplitRef}
            className={
              is2xlUp ? "flex min-w-0 flex-row items-stretch gap-3" : "flex min-w-0 flex-col gap-4"
            }
          >
            <div
              className={is2xlUp ? "min-w-0 flex-[0_0_auto]" : "min-w-0"}
              style={is2xlUp ? { flexBasis: `${detailSplitRatio * 100}%` } : undefined}
            >
              <ScreenPanel
                {...screenPanelProps}
                controls={<ControlsPanel {...controlsPanelProps} />}
              />
            </div>

            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize panels"
              className={`group relative h-full w-4 cursor-col-resize touch-none items-center justify-center ${
                is2xlUp ? "flex" : "hidden"
              }`}
              onPointerDown={is2xlUp ? handleDetailSplitPointerDown : undefined}
            >
              <span className="bg-latte-surface2/70 group-hover:bg-latte-lavender/60 pointer-events-none absolute inset-y-8 left-1/2 w-[2px] -translate-x-1/2 rounded-full transition-colors duration-200" />
              <span className="border-latte-surface2/70 bg-latte-crust/60 pointer-events-none flex h-10 w-4 items-center justify-center rounded-full border">
                <span className="flex flex-col items-center gap-1">
                  <span className="bg-latte-lavender/70 h-1 w-1 rounded-full" />
                  <span className="bg-latte-lavender/70 h-1 w-1 rounded-full" />
                  <span className="bg-latte-lavender/70 h-1 w-1 rounded-full" />
                </span>
              </span>
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-4">
              <DiffSection {...diffSectionProps} />

              <CommitSection {...commitSectionProps} />
            </div>
          </div>
        </div>
      </div>

      <div className="md:hidden">
        <QuickPanel {...quickPanelProps} />
      </div>

      <LogModal {...logModalProps} />
    </>
  );
};
