import { type MutableRefObject, useCallback } from "react";

import {
  extractLogReferenceLocation,
  normalizeLogReference,
} from "@/features/shared-session-ui/lib/log-file-reference";
import {
  type LogFileCandidateItem,
  closeLogFileCandidate,
  initializeLogResolveRequest,
  isCurrentLogResolveRequest,
  openLogFileCandidateModalState,
  setLogResolveErrorIfCurrent,
} from "./useSessionFiles-log-resolve-state";
import type {
  SessionFilesUiDispatch,
  SessionFilesUiState,
} from "./useSessionFiles-ui-state-machine";

type UseSessionFilesLogResolveActionsState = Pick<
  SessionFilesUiState,
  "logFileCandidatePaneId" | "logFileCandidateLine"
>;

type UseSessionFilesLogResolveActionsDeps = {
  paneId: string;
  logFileResolveMatchLimit: number;
  logFileResolvePageLimit: number;
  activeLogResolveRequestIdRef: MutableRefObject<number>;
  findExactNameMatches: (args: {
    paneId: string;
    filename: string;
    maxMatches: number;
    limitPerPage: number;
    requestId?: number;
  }) => Promise<LogFileCandidateItem[] | null>;
  tryOpenExistingPath: (args: {
    paneId: string;
    path: string;
    requestId: number;
    highlightLine?: number | null;
  }) => Promise<boolean>;
  openFileModalByPath: (
    targetPath: string,
    options: {
      paneId: string;
      origin: "navigator" | "log";
      highlightLine?: number | null;
    },
  ) => void;
};

export const useSessionFilesLogResolveActions = (
  { logFileCandidatePaneId, logFileCandidateLine }: UseSessionFilesLogResolveActionsState,
  dispatch: SessionFilesUiDispatch,
  {
    paneId,
    logFileResolveMatchLimit,
    logFileResolvePageLimit,
    activeLogResolveRequestIdRef,
    findExactNameMatches,
    tryOpenExistingPath,
    openFileModalByPath,
  }: UseSessionFilesLogResolveActionsDeps,
) => {
  const onResolveLogFileReference = useCallback(
    async ({
      rawToken,
      sourcePaneId,
      sourceRepoRoot,
    }: {
      rawToken: string;
      sourcePaneId: string;
      sourceRepoRoot: string | null;
    }) => {
      const requestId = initializeLogResolveRequest({
        activeLogResolveRequestIdRef,
        dispatch,
      });

      if (sourcePaneId.trim().length === 0) {
        setLogResolveErrorIfCurrent({
          activeLogResolveRequestIdRef,
          requestId,
          dispatch,
          message: "Session context is unavailable.",
        });
        return;
      }

      const location = extractLogReferenceLocation(rawToken);
      const reference = normalizeLogReference(rawToken, { sourceRepoRoot });
      if (reference.kind === "unknown") {
        setLogResolveErrorIfCurrent({
          activeLogResolveRequestIdRef,
          requestId,
          dispatch,
          message: "No file reference found in token.",
        });
        return;
      }

      if (reference.normalizedPath) {
        const opened = await tryOpenExistingPath({
          paneId: sourcePaneId,
          path: reference.normalizedPath,
          requestId,
          highlightLine: location.line,
        });
        if (
          !isCurrentLogResolveRequest({
            activeLogResolveRequestIdRef,
            requestId,
          })
        ) {
          return;
        }
        if (opened) {
          return;
        }
      }

      if (!reference.filename) {
        setLogResolveErrorIfCurrent({
          activeLogResolveRequestIdRef,
          requestId,
          dispatch,
          message: "File not found.",
        });
        return;
      }

      let matches: LogFileCandidateItem[] | null = null;
      try {
        matches = await findExactNameMatches({
          paneId: sourcePaneId,
          filename: reference.filename,
          maxMatches: logFileResolveMatchLimit,
          limitPerPage: logFileResolvePageLimit,
          requestId,
        });
      } catch {
        setLogResolveErrorIfCurrent({
          activeLogResolveRequestIdRef,
          requestId,
          dispatch,
          message: "Failed to resolve file reference.",
        });
        return;
      }

      if (
        !isCurrentLogResolveRequest({
          activeLogResolveRequestIdRef,
          requestId,
        }) ||
        matches == null
      ) {
        return;
      }

      if (matches.length === 0) {
        setLogResolveErrorIfCurrent({
          activeLogResolveRequestIdRef,
          requestId,
          dispatch,
          message: `No file matched: ${reference.filename}`,
        });
        return;
      }
      if (matches.length === 1 && matches[0]) {
        openFileModalByPath(matches[0].path, {
          paneId: sourcePaneId,
          origin: "log",
          highlightLine: location.line,
        });
        return;
      }

      openLogFileCandidateModalState({
        dispatch,
        reference: reference.display,
        paneId: sourcePaneId,
        line: location.line,
        items: matches,
      });
    },
    [
      activeLogResolveRequestIdRef,
      dispatch,
      findExactNameMatches,
      logFileResolveMatchLimit,
      logFileResolvePageLimit,
      openFileModalByPath,
      tryOpenExistingPath,
    ],
  );

  const onSelectLogFileCandidate = useCallback(
    (path: string) => {
      const targetPaneId = logFileCandidatePaneId ?? paneId;
      const targetLine = logFileCandidateLine;
      closeLogFileCandidate(dispatch);
      openFileModalByPath(path, {
        paneId: targetPaneId,
        origin: "log",
        highlightLine: targetLine,
      });
    },
    [dispatch, logFileCandidateLine, logFileCandidatePaneId, openFileModalByPath, paneId],
  );

  const onCloseLogFileCandidateModal = useCallback(() => {
    closeLogFileCandidate(dispatch);
  }, [dispatch]);

  return {
    onResolveLogFileReference,
    onSelectLogFileCandidate,
    onCloseLogFileCandidateModal,
  };
};
