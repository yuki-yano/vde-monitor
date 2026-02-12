import { type Dispatch, type MutableRefObject, type SetStateAction, useCallback } from "react";

import { extractLogReferenceLocation, normalizeLogReference } from "../log-file-reference";
import {
  initializeLogResolveRequest,
  isCurrentLogResolveRequest,
  type LogFileCandidateItem,
  openLogFileCandidateModalState,
  setLogResolveErrorIfCurrent,
} from "./useSessionFiles-log-resolve-state";

type SetState<T> = Dispatch<SetStateAction<T>>;

type UseSessionFilesLogResolveActionsArgs = {
  paneId: string;
  logFileResolveMatchLimit: number;
  logFileResolvePageLimit: number;
  activeLogResolveRequestIdRef: MutableRefObject<number>;
  logFileCandidatePaneId: string | null;
  logFileCandidateLine: number | null;
  setFileResolveError: SetState<string | null>;
  setLogFileCandidateModalOpen: SetState<boolean>;
  setLogFileCandidateReference: SetState<string | null>;
  setLogFileCandidatePaneId: SetState<string | null>;
  setLogFileCandidateLine: SetState<number | null>;
  setLogFileCandidateItems: SetState<LogFileCandidateItem[]>;
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
  resetLogFileCandidateState: () => void;
};

export const useSessionFilesLogResolveActions = ({
  paneId,
  logFileResolveMatchLimit,
  logFileResolvePageLimit,
  activeLogResolveRequestIdRef,
  logFileCandidatePaneId,
  logFileCandidateLine,
  setFileResolveError,
  setLogFileCandidateModalOpen,
  setLogFileCandidateReference,
  setLogFileCandidatePaneId,
  setLogFileCandidateLine,
  setLogFileCandidateItems,
  findExactNameMatches,
  tryOpenExistingPath,
  openFileModalByPath,
  resetLogFileCandidateState,
}: UseSessionFilesLogResolveActionsArgs) => {
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
        setFileResolveError,
        setLogFileCandidateModalOpen,
        setLogFileCandidateReference,
        setLogFileCandidatePaneId,
        setLogFileCandidateLine,
        setLogFileCandidateItems,
      });

      if (sourcePaneId.trim().length === 0) {
        setLogResolveErrorIfCurrent({
          activeLogResolveRequestIdRef,
          requestId,
          setFileResolveError,
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
          setFileResolveError,
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
          setFileResolveError,
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
          setFileResolveError,
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
          setFileResolveError,
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
        setLogFileCandidateModalOpen,
        setLogFileCandidateReference,
        setLogFileCandidatePaneId,
        setLogFileCandidateLine,
        setLogFileCandidateItems,
        reference: reference.display,
        paneId: sourcePaneId,
        line: location.line,
        items: matches,
      });
    },
    [
      activeLogResolveRequestIdRef,
      findExactNameMatches,
      logFileResolveMatchLimit,
      logFileResolvePageLimit,
      openFileModalByPath,
      setFileResolveError,
      setLogFileCandidateItems,
      setLogFileCandidateLine,
      setLogFileCandidateModalOpen,
      setLogFileCandidatePaneId,
      setLogFileCandidateReference,
      tryOpenExistingPath,
    ],
  );

  const onSelectLogFileCandidate = useCallback(
    (path: string) => {
      const targetPaneId = logFileCandidatePaneId ?? paneId;
      const targetLine = logFileCandidateLine;
      resetLogFileCandidateState();
      openFileModalByPath(path, {
        paneId: targetPaneId,
        origin: "log",
        highlightLine: targetLine,
      });
    },
    [
      logFileCandidateLine,
      logFileCandidatePaneId,
      openFileModalByPath,
      paneId,
      resetLogFileCandidateState,
    ],
  );

  const onCloseLogFileCandidateModal = useCallback(() => {
    resetLogFileCandidateState();
  }, [resetLogFileCandidateState]);

  return {
    onResolveLogFileReference,
    onSelectLogFileCandidate,
    onCloseLogFileCandidateModal,
  };
};
