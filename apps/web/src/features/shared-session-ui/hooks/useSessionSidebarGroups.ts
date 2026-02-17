import type { SessionSummary } from "@vde-monitor/shared";
import { useMemo } from "react";

import {
  matchesSessionListFilter,
  type SessionListFilter,
} from "@/features/shared-session-ui/model/session-list-filters";
import {
  buildSessionWindowGroups,
  type SessionWindowGroup,
} from "@/features/shared-session-ui/model/session-window-group";
import { buildSessionGroups, type SessionGroup } from "@/lib/session-group";

export type SidebarRepoGroup = {
  repoRoot: SessionGroup["repoRoot"];
  windowGroups: SessionWindowGroup[];
};

type UseSessionSidebarGroupsArgs = {
  sessionGroups: SessionGroup[];
  filter: SessionListFilter;
  getRepoSortAnchorAt?: (repoRoot: string | null) => number | null;
};

export const useSessionSidebarGroups = ({
  sessionGroups,
  filter,
  getRepoSortAnchorAt,
}: UseSessionSidebarGroupsArgs) => {
  const filteredSessions = useMemo(
    () =>
      sessionGroups
        .flatMap((group) => group.sessions)
        .filter((session) => matchesSessionListFilter(session, filter)),
    [filter, sessionGroups],
  );

  const filteredSessionGroups = useMemo(() => {
    return buildSessionGroups(filteredSessions, { getRepoSortAnchorAt });
  }, [filteredSessions, getRepoSortAnchorAt]);

  const sidebarGroups = useMemo(() => {
    return filteredSessionGroups
      .map((group) => {
        const windowGroups = buildSessionWindowGroups(group.sessions);
        if (windowGroups.length === 0) {
          return null;
        }
        return {
          repoRoot: group.repoRoot,
          windowGroups,
        };
      })
      .filter((group): group is SidebarRepoGroup => Boolean(group));
  }, [filteredSessionGroups]);

  const { totalSessions, repoCount, sessionIndex } = useMemo(() => {
    let total = 0;
    const map = new Map<string, SessionSummary>();
    sidebarGroups.forEach((group) => {
      group.windowGroups.forEach((windowGroup) => {
        total += windowGroup.sessions.length;
        windowGroup.sessions.forEach((session) => {
          map.set(session.paneId, session);
        });
      });
    });
    return { totalSessions: total, repoCount: sidebarGroups.length, sessionIndex: map };
  }, [sidebarGroups]);

  return {
    sidebarGroups,
    totalSessions,
    repoCount,
    sessionIndex,
  };
};
