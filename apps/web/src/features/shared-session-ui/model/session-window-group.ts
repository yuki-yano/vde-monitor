import type { SessionSummary } from "@vde-monitor/shared";

import { compareSessionSortDesc, pickLatestSessionSortAt } from "@/lib/session-sort";
import { pickLatestInputAt } from "@/lib/session-time";

export type SessionWindowGroup = {
  sessionId: string;
  windowId: string;
  sessionName: string;
  windowIndex: number;
  sessions: SessionSummary[];
  lastInputAt: string | null;
  sortAt: number;
};

export const getSessionWindowGroupKey = (
  group: Pick<SessionWindowGroup, "sessionId" | "windowId">,
) => `${group.sessionId}:${group.windowId}`;

const comparePanes = (a: SessionSummary, b: SessionSummary) => {
  const sortCompare = compareSessionSortDesc(a, b);
  if (sortCompare !== 0) return sortCompare;
  if (a.paneIndex !== b.paneIndex) {
    return a.paneIndex - b.paneIndex;
  }
  return a.paneId.localeCompare(b.paneId);
};

const compareGroups = (a: SessionWindowGroup, b: SessionWindowGroup) => {
  if (a.sortAt !== b.sortAt) return b.sortAt - a.sortAt;

  const sessionCompare = a.sessionName.localeCompare(b.sessionName);
  if (sessionCompare !== 0) {
    return sessionCompare;
  }

  const windowIndexCompare = a.windowIndex - b.windowIndex;
  if (windowIndexCompare !== 0) {
    return windowIndexCompare;
  }

  const sessionIdCompare = a.sessionId.localeCompare(b.sessionId);
  if (sessionIdCompare !== 0) {
    return sessionIdCompare;
  }

  return a.windowId.localeCompare(b.windowId);
};

export const buildSessionWindowGroups = (sessions: SessionSummary[]): SessionWindowGroup[] => {
  const grouped = new Map<string, SessionSummary[]>();

  sessions.forEach((session) => {
    const key = `${session.sessionId}:${session.windowId}`;
    const bucket = grouped.get(key) ?? [];
    bucket.push(session);
    grouped.set(key, bucket);
  });

  const groups: SessionWindowGroup[] = [];
  grouped.forEach((groupSessions) => {
    const sorted = [...groupSessions].sort(comparePanes);
    const first = sorted[0];
    if (!first) {
      return;
    }
    groups.push({
      sessionId: first.sessionId,
      windowId: first.windowId,
      sessionName: first.sessionName,
      windowIndex: first.windowIndex,
      sessions: sorted,
      lastInputAt: pickLatestInputAt(sorted),
      sortAt: pickLatestSessionSortAt(sorted),
    });
  });

  return groups.sort(compareGroups);
};
