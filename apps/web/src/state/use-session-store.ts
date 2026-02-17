import type { SessionDetail, SessionSummary } from "@vde-monitor/shared";
import { atom, useAtomValue, useSetAtom } from "jotai";
import { useCallback } from "react";

const toSessionDetail = (session: SessionSummary): SessionDetail => ({
  ...session,
  startCommand: null,
  panePid: null,
});

const toUniqueSessions = (nextSessions: SessionSummary[]) => {
  const unique = new Map<string, SessionSummary>();
  nextSessions.forEach((session) => {
    unique.set(session.paneId, session);
  });
  return Array.from(unique.values());
};

export const sessionsAtom = atom<SessionSummary[]>([]);
export const setSessionsAtom = atom(null, (_get, set, nextSessions: SessionSummary[]) => {
  set(sessionsAtom, nextSessions);
});
export const applySessionsSnapshotAtom = atom(null, (_get, set, nextSessions: SessionSummary[]) => {
  set(sessionsAtom, toUniqueSessions(nextSessions));
});
export const updateSessionAtom = atom(null, (get, set, session: SessionSummary) => {
  const next = new Map<string, SessionSummary>();
  get(sessionsAtom).forEach((item) => next.set(item.paneId, item));
  next.set(session.paneId, session);
  set(sessionsAtom, Array.from(next.values()));
});
export const removeSessionAtom = atom(null, (get, set, paneId: string) => {
  set(
    sessionsAtom,
    get(sessionsAtom).filter((item) => item.paneId !== paneId),
  );
});
export const getSessionDetailByPaneAtom = atom((get) => (paneId: string) => {
  const session = get(sessionsAtom).find((item) => item.paneId === paneId);
  return session ? toSessionDetail(session) : null;
});

export const useSessionStore = () => {
  const sessions = useAtomValue(sessionsAtom);
  const setSessionsValue = useSetAtom(setSessionsAtom);
  const applySessionsSnapshotValue = useSetAtom(applySessionsSnapshotAtom);
  const updateSessionValue = useSetAtom(updateSessionAtom);
  const removeSessionValue = useSetAtom(removeSessionAtom);
  const getSessionDetailByPane = useAtomValue(getSessionDetailByPaneAtom);

  const setSessions = useCallback(
    (nextSessions: SessionSummary[]) => {
      setSessionsValue(nextSessions);
    },
    [setSessionsValue],
  );

  const applySessionsSnapshot = useCallback(
    (nextSessions: SessionSummary[]) => {
      applySessionsSnapshotValue(nextSessions);
    },
    [applySessionsSnapshotValue],
  );

  const updateSession = useCallback(
    (session: SessionSummary) => {
      updateSessionValue(session);
    },
    [updateSessionValue],
  );

  const removeSession = useCallback(
    (paneId: string) => {
      removeSessionValue(paneId);
    },
    [removeSessionValue],
  );

  const getSessionDetail = useCallback(
    (paneId: string) => {
      return getSessionDetailByPane(paneId);
    },
    [getSessionDetailByPane],
  );

  return {
    sessions,
    setSessions,
    applySessionsSnapshot,
    updateSession,
    removeSession,
    getSessionDetail,
  };
};
