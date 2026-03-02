import { useAtomValue } from "jotai";

import { useNowMs } from "@/lib/use-now-ms";
import { useSessions } from "@/state/session-context";
import { useTheme } from "@/state/theme-context";

import { screenTextAtom } from "../atoms/screenAtoms";

export const useSessionDetailVMState = (paneId: string) => {
  const {
    sessions,
    connected,
    connectionStatus,
    connectionIssue,
    highlightCorrections,
    fileNavigatorConfig,
    launchConfig,
    refreshSessions,
    requestWorktrees,
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
    updateSessionTitle,
    resetSessionTitle,
    createRepoNote,
    updateRepoNote,
    deleteRepoNote,
    getSessionDetail,
  } = useSessions();
  const { resolvedTheme } = useTheme();
  const screenText = useAtomValue(screenTextAtom);
  const nowMs = useNowMs();
  const session = getSessionDetail(paneId);

  return {
    sessions,
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
    updateSessionTitle,
    resetSessionTitle,
    createRepoNote,
    updateRepoNote,
    deleteRepoNote,
  };
};
