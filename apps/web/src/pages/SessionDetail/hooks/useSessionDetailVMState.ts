import { useAtomValue } from "jotai";
import { useMemo } from "react";

import { useNowMs } from "@/lib/use-now-ms";
import {
  useSessionBranchesApi,
  useSessionConfigData,
  useSessionCoreApi,
  useSessionFilesApi,
  useSessionLaunchApi,
  useSessionNotesApi,
  useSessionStreamData,
} from "@/state/session-context";
import { useTheme } from "@/state/theme-context";

import { screenTextAtom } from "../atoms/screenAtoms";

export const useSessionDetailVMState = (paneId: string) => {
  const { sessions, connected, connectionStatus, connectionIssue, getSessionDetail } =
    useSessionStreamData();
  const { token, apiBaseUrl, highlightCorrections, fileNavigatorConfig, launchConfig } =
    useSessionConfigData();
  const {
    refreshSessions,
    requestStateTimeline,
    requestScreen,
    focusPane,
    killPane,
    killWindow,
    uploadImageAttachment,
    sendText,
    sendKeys,
    sendRaw,
    touchSession,
    acknowledgeSessionView,
    updateSessionTitle,
    resetSessionTitle,
  } = useSessionCoreApi();
  const {
    requestWorktrees,
    requestBranches,
    requestBranchCheckout,
    requestBranchCreate,
    requestBranchDelete,
    requestDiffSummary,
    requestDiffFile,
    requestCommitLog,
    requestCommitDetail,
    requestCommitFile,
  } = useSessionBranchesApi();
  const { requestRepoFileTree, requestRepoFileSearch, requestRepoFileContent } =
    useSessionFilesApi();
  const { requestRepoNotes, createRepoNote, updateRepoNote, deleteRepoNote } = useSessionNotesApi();
  const { launchAgentInSession } = useSessionLaunchApi();
  const { resolvedTheme } = useTheme();
  const screenText = useAtomValue(screenTextAtom);
  const nowMs = useNowMs();
  const session = getSessionDetail(paneId);

  // Memoized so identity only changes when a field a consumer actually reads
  // changes. Without this, SessionDetailProvider's own final useMemo (which
  // depends on `base`) would cache-miss on every render regardless of cause,
  // forcing every SessionDetailContext consumer to re-run on every SSE tick.
  return useMemo(
    () => ({
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
      refreshSessions,
      requestWorktrees,
      requestBranches,
      requestBranchCheckout,
      requestBranchCreate,
      requestBranchDelete,
      requestDiffSummary,
      requestDiffFile,
      requestCommitLog,
      requestCommitDetail,
      requestCommitFile,
      requestStateTimeline,
      requestRepoNotes,
      requestRepoFileTree,
      requestRepoFileSearch,
      requestRepoFileContent,
      requestScreen,
      focusPane,
      killPane,
      killWindow,
      launchAgentInSession,
      uploadImageAttachment,
      sendText,
      sendKeys,
      sendRaw,
      touchSession,
      acknowledgeSessionView,
      updateSessionTitle,
      resetSessionTitle,
      createRepoNote,
      updateRepoNote,
      deleteRepoNote,
    }),
    [
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
      refreshSessions,
      requestWorktrees,
      requestBranches,
      requestBranchCheckout,
      requestBranchCreate,
      requestBranchDelete,
      requestDiffSummary,
      requestDiffFile,
      requestCommitLog,
      requestCommitDetail,
      requestCommitFile,
      requestStateTimeline,
      requestRepoNotes,
      requestRepoFileTree,
      requestRepoFileSearch,
      requestRepoFileContent,
      requestScreen,
      focusPane,
      killPane,
      killWindow,
      launchAgentInSession,
      uploadImageAttachment,
      sendText,
      sendKeys,
      sendRaw,
      touchSession,
      acknowledgeSessionView,
      updateSessionTitle,
      resetSessionTitle,
      createRepoNote,
      updateRepoNote,
      deleteRepoNote,
    ],
  );
};
