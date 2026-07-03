import type { RepoFileSearchPage } from "@vde-monitor/shared";
import type { MutableRefObject } from "react";

import { type SessionFilesUiDispatch, setUiState } from "./useSessionFiles-ui-state-machine";

export type LogFileCandidateItem = Pick<
  RepoFileSearchPage["items"][number],
  "path" | "name" | "isIgnored"
>;

type SetLogResolveErrorIfCurrentInput = {
  activeLogResolveRequestIdRef: MutableRefObject<number>;
  requestId: number;
  dispatch: SessionFilesUiDispatch;
  message: string;
};

type OpenLogFileCandidateInput = {
  dispatch: SessionFilesUiDispatch;
  reference: string;
  paneId: string;
  line: number | null;
  items: LogFileCandidateItem[];
};

export const createNextLogResolveRequestId = (
  activeLogResolveRequestIdRef: MutableRefObject<number>,
) => {
  const requestId = activeLogResolveRequestIdRef.current + 1;
  activeLogResolveRequestIdRef.current = requestId;
  return requestId;
};

export const isCurrentLogResolveRequest = ({
  activeLogResolveRequestIdRef,
  requestId,
}: {
  activeLogResolveRequestIdRef: MutableRefObject<number>;
  requestId: number;
}) => activeLogResolveRequestIdRef.current === requestId;

export const closeLogFileCandidate = (dispatch: SessionFilesUiDispatch) => {
  dispatch({ type: "closeLogFileCandidate" });
};

// Starts a new log-reference resolution: bumps the request id (so any
// in-flight resolution becomes stale) and clears the previous error/candidate
// picker in a single dispatch.
export const initializeLogResolveRequest = ({
  activeLogResolveRequestIdRef,
  dispatch,
}: {
  activeLogResolveRequestIdRef: MutableRefObject<number>;
  dispatch: SessionFilesUiDispatch;
}) => {
  const requestId = createNextLogResolveRequestId(activeLogResolveRequestIdRef);
  dispatch({ type: "startLogResolve" });
  return requestId;
};

export const setLogResolveErrorIfCurrent = ({
  activeLogResolveRequestIdRef,
  requestId,
  dispatch,
  message,
}: SetLogResolveErrorIfCurrentInput) => {
  if (!isCurrentLogResolveRequest({ activeLogResolveRequestIdRef, requestId })) {
    return;
  }
  setUiState(dispatch, "fileResolveError", message);
};

export const openLogFileCandidateModalState = ({
  dispatch,
  reference,
  paneId,
  line,
  items,
}: OpenLogFileCandidateInput) => {
  dispatch({ type: "openLogFileCandidate", reference, paneId, line, items });
};
