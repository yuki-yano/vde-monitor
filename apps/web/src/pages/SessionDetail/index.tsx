import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useCallback, useMemo } from "react";

import { Card } from "@/components/ui";
import { buildSessionGroups } from "@/lib/session-group";
import { useNowMs } from "@/lib/use-now-ms";
import { useSessions } from "@/state/session-context";
import { useTheme } from "@/state/theme-context";

import { CommitSection } from "./components/CommitSection";
import { ControlsPanel } from "./components/ControlsPanel";
import { DiffSection } from "./components/DiffSection";
import { LogModal } from "./components/LogModal";
import { QuickPanel } from "./components/QuickPanel";
import { ScreenPanel } from "./components/ScreenPanel";
import { SessionHeader } from "./components/SessionHeader";
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
    setIsAtBottom,
    refreshScreen,
    scrollToBottom,
    handleModeChange,
    virtuosoRef,
  } = useSessionScreen({
    paneId,
    connected,
    connectionIssue,
    requestScreen,
    resolvedTheme,
    agent: session?.agent,
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
      <div className="animate-fade-in-up mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-6">
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

        <div className="flex min-w-0 flex-col gap-4">
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
            isAtBottom={isAtBottom}
            onAtBottomChange={setIsAtBottom}
            onScrollToBottom={scrollToBottom}
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

      <QuickPanel
        open={quickPanelOpen}
        sessionGroups={sessionGroups}
        nowMs={nowMs}
        currentPaneId={paneId}
        onOpenLogModal={openLogModal}
        onClose={closeQuickPanel}
        onToggle={toggleQuickPanel}
      />

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
