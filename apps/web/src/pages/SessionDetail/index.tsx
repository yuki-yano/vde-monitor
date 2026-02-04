import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { type CSSProperties, useCallback, useMemo } from "react";

import { Card } from "@/components/ui";
import { buildSessionGroups } from "@/lib/session-group";
import { useMediaQuery } from "@/lib/use-media-query";
import { useNowMs } from "@/lib/use-now-ms";
import { useSidebarWidth } from "@/lib/use-sidebar-width";
import { useSplitRatio } from "@/lib/use-split-ratio";
import { useSessions } from "@/state/session-context";
import { useTheme } from "@/state/theme-context";

import { CommitSection } from "./components/CommitSection";
import { ControlsPanel } from "./components/ControlsPanel";
import { DiffSection } from "./components/DiffSection";
import { LogModal } from "./components/LogModal";
import { QuickPanel } from "./components/QuickPanel";
import { ScreenPanel } from "./components/ScreenPanel";
import { SessionHeader } from "./components/SessionHeader";
import { SessionSidebar } from "./components/SessionSidebar";
import { useSessionCommits } from "./hooks/useSessionCommits";
import { useSessionControls } from "./hooks/useSessionControls";
import { useSessionDiffs } from "./hooks/useSessionDiffs";
import { useSessionLogs } from "./hooks/useSessionLogs";
import { useSessionScreen } from "./hooks/useSessionScreen";
import { useSessionTitleEditor } from "./hooks/useSessionTitleEditor";
import { backLinkClass } from "./sessionDetailUtils";

export const SessionDetailPage = () => {
  const { paneId } = useParams({ from: "/sessions/$paneId" });
  const {
    sessions,
    connected,
    connectionIssue,
    getSessionDetail,
    reconnect,
    requestCommitDetail,
    requestCommitFile,
    requestCommitLog,
    requestDiffFile,
    requestDiffSummary,
    requestScreen,
    sendText,
    sendKeys,
    touchSession,
    updateSessionTitle,
    readOnly,
    highlightCorrections,
  } = useSessions();
  const { resolvedTheme } = useTheme();
  const session = getSessionDetail(paneId);
  const navigate = useNavigate();
  const nowMs = useNowMs();

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
    resolvedTheme,
    agent: session?.agent,
    highlightCorrections,
  });

  const {
    textInputRef,
    autoEnter,
    shiftHeld,
    ctrlHeld,
    controlsOpen,
    handleSendKey,
    handleSendText,
    toggleAutoEnter,
    toggleControls,
    toggleShift,
    toggleCtrl,
  } = useSessionControls({
    paneId,
    readOnly,
    mode,
    sendText,
    sendKeys,
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
    readOnly,
    updateSessionTitle,
  });

  const sessionGroups = useMemo(() => buildSessionGroups(sessions), [sessions]);
  const is2xlUp = useMediaQuery("(min-width: 1536px)");
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

  const handleRefreshScreen = useCallback(() => {
    if (connected) {
      void refreshScreen();
    } else {
      reconnect();
    }
  }, [connected, reconnect, refreshScreen]);

  const handleOpenInNewTab = useCallback(() => {
    if (!selectedPaneId) return;
    const encoded = encodeURIComponent(selectedPaneId);
    window.open(`/sessions/${encoded}`, "_blank", "noopener,noreferrer");
  }, [selectedPaneId]);

  const handleTouchSession = useCallback(() => {
    void touchSession(paneId).catch(() => null);
  }, [paneId, touchSession]);

  const handleOpenHere = useCallback(() => {
    if (!selectedPaneId) return;
    closeQuickPanel();
    navigate({ to: "/sessions/$paneId", params: { paneId: selectedPaneId } });
    closeLogModal();
  }, [closeLogModal, closeQuickPanel, navigate, selectedPaneId]);

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
        <SessionSidebar
          sessionGroups={sessionGroups}
          nowMs={nowMs}
          currentPaneId={paneId}
          className="border-latte-surface1/80 h-full w-full rounded-none rounded-r-3xl border-r"
        />
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
          <SessionHeader
            session={session}
            readOnly={readOnly}
            connectionIssue={connectionIssue}
            nowMs={nowMs}
            titleDraft={titleDraft}
            titleEditing={titleEditing}
            titleSaving={titleSaving}
            titleError={titleError}
            onTitleDraftChange={updateTitleDraft}
            onTitleSave={saveTitle}
            onTitleClear={clearTitle}
            onOpenTitleEditor={openTitleEditor}
            onCloseTitleEditor={closeTitleEditor}
          />

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
                mode={mode}
                onModeChange={handleModeChange}
                connected={connected}
                onRefresh={handleRefreshScreen}
                fallbackReason={fallbackReason}
                error={error}
                isScreenLoading={isScreenLoading}
                imageBase64={imageBase64}
                screenLines={screenLines}
                virtuosoRef={virtuosoRef}
                scrollerRef={scrollerRef}
                isAtBottom={isAtBottom}
                forceFollow={forceFollow}
                onAtBottomChange={handleAtBottomChange}
                onScrollToBottom={scrollToBottom}
                onUserScrollStateChange={handleUserScrollStateChange}
                controls={
                  <ControlsPanel
                    readOnly={readOnly}
                    connected={connected}
                    textInputRef={textInputRef}
                    onSendText={handleSendText}
                    autoEnter={autoEnter}
                    onToggleAutoEnter={toggleAutoEnter}
                    controlsOpen={controlsOpen}
                    onToggleControls={toggleControls}
                    shiftHeld={shiftHeld}
                    onToggleShift={toggleShift}
                    ctrlHeld={ctrlHeld}
                    onToggleCtrl={toggleCtrl}
                    onSendKey={handleSendKey}
                    onTouchSession={handleTouchSession}
                  />
                }
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
              <DiffSection
                diffSummary={diffSummary}
                diffError={diffError}
                diffLoading={diffLoading}
                diffFiles={diffFiles}
                diffOpen={diffOpen}
                diffLoadingFiles={diffLoadingFiles}
                onRefresh={refreshDiff}
                onToggle={toggleDiff}
              />

              <CommitSection
                commitLog={commitLog}
                commitError={commitError}
                commitLoading={commitLoading}
                commitLoadingMore={commitLoadingMore}
                commitHasMore={commitHasMore}
                commitDetails={commitDetails}
                commitFileDetails={commitFileDetails}
                commitFileOpen={commitFileOpen}
                commitFileLoading={commitFileLoading}
                commitOpen={commitOpen}
                commitLoadingDetails={commitLoadingDetails}
                copiedHash={copiedHash}
                onRefresh={refreshCommitLog}
                onLoadMore={loadMoreCommits}
                onToggleCommit={toggleCommit}
                onToggleCommitFile={toggleCommitFile}
                onCopyHash={copyHash}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="md:hidden">
        <QuickPanel
          open={quickPanelOpen}
          sessionGroups={sessionGroups}
          nowMs={nowMs}
          currentPaneId={paneId}
          onOpenLogModal={openLogModal}
          onClose={closeQuickPanel}
          onToggle={toggleQuickPanel}
        />
      </div>

      <LogModal
        open={logModalOpen}
        session={selectedSession}
        logLines={selectedLogLines}
        loading={selectedLogLoading}
        error={selectedLogError}
        onClose={closeLogModal}
        onOpenHere={handleOpenHere}
        onOpenNewTab={handleOpenInNewTab}
      />
    </>
  );
};
