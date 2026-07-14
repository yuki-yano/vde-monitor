import type { SessionSummary } from "@vde-monitor/shared";

import { parseTime } from "./session-time";

type SessionSortFields = Pick<SessionSummary, "lastInputAt" | "lastRunStartedAt" | "manualSortAt">;

const resolveComparableTime = (value: string | null) =>
  parseTime(value) ?? Number.NEGATIVE_INFINITY;

export const resolveSessionSortAt = (session: SessionSortFields) =>
  Math.max(
    resolveComparableTime(session.lastRunStartedAt),
    resolveComparableTime(session.lastInputAt),
    resolveComparableTime(session.manualSortAt),
  );

export const compareSessionSortDesc = (a: SessionSortFields, b: SessionSortFields) => {
  const aSortAt = resolveSessionSortAt(a);
  const bSortAt = resolveSessionSortAt(b);
  if (aSortAt === bSortAt) {
    return 0;
  }
  return bSortAt - aSortAt;
};

export const pickLatestSessionSortAt = (sessions: SessionSortFields[]) =>
  sessions.reduce(
    (latest, session) => Math.max(latest, resolveSessionSortAt(session)),
    Number.NEGATIVE_INFINITY,
  );
