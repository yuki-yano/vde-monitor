import type { SessionSummary } from "@vde-monitor/shared";
import { useMemo } from "react";

import { useSessionListPins } from "@/features/shared-session-ui/hooks/useSessionListPins";
import { buildSessionGroups } from "@/lib/session-group";

type UseSessionRepoPinsArgs = {
  sessions: SessionSummary[];
};

export const useSessionRepoPins = ({ sessions }: UseSessionRepoPinsArgs) => {
  const { getRepoSortAnchorAt, touchRepoPin } = useSessionListPins({});
  const sessionGroups = useMemo(
    () => buildSessionGroups(sessions, { getRepoSortAnchorAt }),
    [sessions, getRepoSortAnchorAt],
  );

  return {
    getRepoSortAnchorAt,
    touchRepoSortAnchor: touchRepoPin,
    sessionGroups,
  };
};
