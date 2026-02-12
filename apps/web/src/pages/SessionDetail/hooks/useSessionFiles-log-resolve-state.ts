import type { RepoFileSearchPage } from "@vde-monitor/shared";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";

export type LogFileCandidateItem = Pick<
  RepoFileSearchPage["items"][number],
  "path" | "name" | "isIgnored"
>;

type SetState<T> = Dispatch<SetStateAction<T>>;

type LogResolveStateSetters = {
  setFileResolveError: SetState<string | null>;
  setLogFileCandidateModalOpen: SetState<boolean>;
  setLogFileCandidateReference: SetState<string | null>;
  setLogFileCandidatePaneId: SetState<string | null>;
  setLogFileCandidateLine: SetState<number | null>;
  setLogFileCandidateItems: SetState<LogFileCandidateItem[]>;
};

type SetLogResolveErrorIfCurrentInput = {
  activeLogResolveRequestIdRef: MutableRefObject<number>;
  requestId: number;
  setFileResolveError: SetState<string | null>;
  message: string;
};

type OpenLogFileCandidateModalStateInput = {
  setLogFileCandidateModalOpen: SetState<boolean>;
  setLogFileCandidateReference: SetState<string | null>;
  setLogFileCandidatePaneId: SetState<string | null>;
  setLogFileCandidateLine: SetState<number | null>;
  setLogFileCandidateItems: SetState<LogFileCandidateItem[]>;
  reference: string;
  paneId: string;
  line: number | null;
  items: LogFileCandidateItem[];
};

type InitializeLogResolveRequestInput = {
  activeLogResolveRequestIdRef: MutableRefObject<number>;
} & LogResolveStateSetters;

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

export const resetLogFileCandidateState = ({
  setLogFileCandidateModalOpen,
  setLogFileCandidateReference,
  setLogFileCandidatePaneId,
  setLogFileCandidateLine,
  setLogFileCandidateItems,
}: Omit<LogResolveStateSetters, "setFileResolveError">) => {
  setLogFileCandidateModalOpen(false);
  setLogFileCandidateReference(null);
  setLogFileCandidatePaneId(null);
  setLogFileCandidateLine(null);
  setLogFileCandidateItems([]);
};

export const initializeLogResolveRequest = ({
  activeLogResolveRequestIdRef,
  setFileResolveError,
  setLogFileCandidateModalOpen,
  setLogFileCandidateReference,
  setLogFileCandidatePaneId,
  setLogFileCandidateLine,
  setLogFileCandidateItems,
}: InitializeLogResolveRequestInput) => {
  const requestId = createNextLogResolveRequestId(activeLogResolveRequestIdRef);
  setFileResolveError(null);
  resetLogFileCandidateState({
    setLogFileCandidateModalOpen,
    setLogFileCandidateReference,
    setLogFileCandidatePaneId,
    setLogFileCandidateLine,
    setLogFileCandidateItems,
  });
  return requestId;
};

export const setLogResolveErrorIfCurrent = ({
  activeLogResolveRequestIdRef,
  requestId,
  setFileResolveError,
  message,
}: SetLogResolveErrorIfCurrentInput) => {
  if (!isCurrentLogResolveRequest({ activeLogResolveRequestIdRef, requestId })) {
    return;
  }
  setFileResolveError(message);
};

export const openLogFileCandidateModalState = ({
  setLogFileCandidateModalOpen,
  setLogFileCandidateReference,
  setLogFileCandidatePaneId,
  setLogFileCandidateLine,
  setLogFileCandidateItems,
  reference,
  paneId,
  line,
  items,
}: OpenLogFileCandidateModalStateInput) => {
  setLogFileCandidateReference(reference);
  setLogFileCandidatePaneId(paneId);
  setLogFileCandidateLine(line);
  setLogFileCandidateItems(items);
  setLogFileCandidateModalOpen(true);
};
