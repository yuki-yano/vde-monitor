import type { SessionDetail, SessionSummary } from "@vde-monitor/shared";
import { atom, useAtomValue, useSetAtom } from "jotai";
import { useCallback } from "react";

// Cached by the SessionSummary object identity so that repeated lookups of
// the *same* summary reference (e.g. across re-renders where nothing about
// this pane changed) return the *same* SessionDetail reference too. Without
// this, every call recreated a brand-new object via spread, which defeated
// downstream useMemo/React.memo for any consumer keying off `session`
// (e.g. SessionDetailProvider's `base`, SessionHeader's props) even when the
// underlying data was untouched. Safe only because nothing mutates the
// returned SessionDetail in place (session/session-detail objects are always
// read or spread into new objects, never written to) — reconcileSessions
// already guarantees a *new* SessionSummary reference whenever content
// actually changes, so the cache naturally invalidates on real updates.
const sessionDetailCache = new WeakMap<SessionSummary, SessionDetail>();
const toSessionDetail = (session: SessionSummary): SessionDetail => {
  const cached = sessionDetailCache.get(session);
  if (cached) {
    return cached;
  }
  const detail: SessionDetail = {
    ...session,
    startCommand: null,
    panePid: null,
  };
  sessionDetailCache.set(session, detail);
  return detail;
};

const toUniqueSessions = (nextSessions: SessionSummary[]) => {
  const unique = new Map<string, SessionSummary>();
  nextSessions.forEach((session) => {
    unique.set(session.paneId, session);
  });
  return Array.from(unique.values());
};

// SessionSummary is a flat object, so shallow field equality is full equality.
const isSameSession = (a: SessionSummary, b: SessionSummary) => {
  if (a === b) {
    return true;
  }
  const aKeys = Object.keys(a) as (keyof SessionSummary)[];
  const bKeys = Object.keys(b) as (keyof SessionSummary)[];
  if (aKeys.length !== bKeys.length) {
    return false;
  }
  return aKeys.every((key) => a[key] === b[key]);
};

// Server responses produce brand-new objects every time. Reuse previous references
// when content is unchanged so downstream useMemo / React.memo can skip re-renders.
const reconcileSessions = (prev: SessionSummary[], next: SessionSummary[]) => {
  const prevByPane = new Map(prev.map((session) => [session.paneId, session]));
  const reconciled = next.map((session) => {
    const previous = prevByPane.get(session.paneId);
    return previous != null && isSameSession(previous, session) ? previous : session;
  });
  const unchanged =
    reconciled.length === prev.length &&
    reconciled.every((session, index) => session === prev[index]);
  return unchanged ? prev : reconciled;
};

const sessionsAtom = atom<SessionSummary[]>([]);
const setSessionsAtom = atom(null, (get, set, nextSessions: SessionSummary[]) => {
  set(sessionsAtom, reconcileSessions(get(sessionsAtom), toUniqueSessions(nextSessions)));
});
const applySessionsSnapshotAtom = atom(null, (get, set, nextSessions: SessionSummary[]) => {
  set(sessionsAtom, reconcileSessions(get(sessionsAtom), toUniqueSessions(nextSessions)));
});
const updateSessionAtom = atom(null, (get, set, session: SessionSummary) => {
  const prev = get(sessionsAtom);
  const existing = prev.find((item) => item.paneId === session.paneId);
  if (existing != null && isSameSession(existing, session)) {
    return;
  }
  const next =
    existing != null
      ? prev.map((item) => (item.paneId === session.paneId ? session : item))
      : [...prev, session];
  set(sessionsAtom, next);
});
const removeSessionAtom = atom(null, (get, set, paneId: string) => {
  set(
    sessionsAtom,
    get(sessionsAtom).filter((item) => item.paneId !== paneId),
  );
});
const getSessionDetailByPaneAtom = atom((get) => (paneId: string) => {
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
