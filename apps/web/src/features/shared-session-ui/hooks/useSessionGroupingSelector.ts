import type { SessionSummary } from "@vde-monitor/shared";
import { useMemo } from "react";

import {
  type SessionListFilter,
  matchesSessionListFilter,
} from "@/features/shared-session-ui/model/session-list-filters";
import { type SessionGroup, buildSessionGroups } from "@/lib/session-group";

type SessionSearchPredicate = (session: SessionSummary, searchQuery: string) => boolean;

type BuildFilteredSessionGroupsArgs = {
  sessionGroups: SessionGroup[];
  filter: SessionListFilter;
  getRepoSortAnchorAt?: (repoRoot: string | null) => number | null;
};

export const buildFilteredSessionGroups = ({
  sessionGroups,
  filter,
  getRepoSortAnchorAt,
}: BuildFilteredSessionGroupsArgs) => {
  const filteredSessions = sessionGroups
    .flatMap((group) => group.sessions)
    .filter((session) => matchesSessionListFilter(session, filter));
  return buildSessionGroups(filteredSessions, { getRepoSortAnchorAt });
};

type UseSessionGroupingSelectorArgs = {
  sessions: SessionSummary[];
  filter: SessionListFilter;
  searchQuery: string;
  matchesSearch: SessionSearchPredicate;
  getRepoSortAnchorAt?: (repoRoot: string | null) => number | null;
};

export const useSessionGroupingSelector = ({
  sessions,
  filter,
  searchQuery,
  matchesSearch,
  getRepoSortAnchorAt,
}: UseSessionGroupingSelectorArgs) => {
  const visibleSessions = useMemo(() => {
    return sessions.filter(
      (session) => matchesSessionListFilter(session, filter) && matchesSearch(session, searchQuery),
    );
  }, [filter, matchesSearch, searchQuery, sessions]);

  const groups = useMemo(
    () => buildSessionGroups(visibleSessions, { getRepoSortAnchorAt }),
    [getRepoSortAnchorAt, visibleSessions],
  );

  const sidebarSessionGroups = useMemo(
    () => buildSessionGroups(sessions, { getRepoSortAnchorAt }),
    [getRepoSortAnchorAt, sessions],
  );

  const quickPanelGroups = useMemo(
    () => buildSessionGroups(visibleSessions, { getRepoSortAnchorAt }),
    [getRepoSortAnchorAt, visibleSessions],
  );

  return {
    visibleSessions,
    groups,
    sidebarSessionGroups,
    quickPanelGroups,
  };
};
