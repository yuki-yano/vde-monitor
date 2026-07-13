import type { SessionSummary } from "@vde-monitor/shared";

import { compareSessionSortDesc, pickLatestSessionSortAt } from "./session-sort";
import { pickLatestInputAt } from "./session-time";

export type SessionGroup = {
  repoRoot: string | null;
  sessions: SessionSummary[];
  lastInputAt: string | null;
};

type BuildSessionGroupOptions = {
  getRepoSortAnchorAt?: (repoRoot: string | null) => number | null;
};

const resolveComparableSortAnchorTime = (value: number | null | undefined) =>
  typeof value === "number" && Number.isFinite(value) ? value : Number.NEGATIVE_INFINITY;

const compareSessions = (a: SessionSummary, b: SessionSummary) => {
  const sortCompare = compareSessionSortDesc(a, b);
  if (sortCompare !== 0) return sortCompare;
  const sessionCompare = a.sessionName.localeCompare(b.sessionName);
  if (sessionCompare !== 0) return sessionCompare;
  return a.paneId.localeCompare(b.paneId);
};

export const buildSessionGroups = (
  sessions: SessionSummary[],
  options?: BuildSessionGroupOptions,
): SessionGroup[] => {
  const grouped = new Map<string | null, SessionSummary[]>();
  sessions.forEach((session) => {
    const key = session.repoRoot ?? null;
    const bucket = grouped.get(key);
    if (bucket) {
      bucket.push(session);
    } else {
      grouped.set(key, [session]);
    }
  });

  const groups = Array.from(grouped.entries()).map(([repoRoot, groupSessions]) => {
    const sorted = [...groupSessions].sort(compareSessions);
    return {
      repoRoot,
      sessions: sorted,
      lastInputAt: pickLatestInputAt(sorted),
      sortAt: Math.max(
        pickLatestSessionSortAt(sorted),
        resolveComparableSortAnchorTime(options?.getRepoSortAnchorAt?.(repoRoot)),
      ),
    };
  });

  groups.sort((a, b) => {
    if (a.sortAt !== b.sortAt) return b.sortAt - a.sortAt;
    if (a.repoRoot == null && b.repoRoot == null) return 0;
    if (a.repoRoot == null) return 1;
    if (b.repoRoot == null) return -1;
    return a.repoRoot.localeCompare(b.repoRoot);
  });

  return groups;
};
