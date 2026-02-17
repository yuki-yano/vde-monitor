import type { SessionSummary } from "@vde-monitor/shared";

import { isKnownAgent } from "@/lib/session-format";
import { buildSessionGroups } from "@/lib/session-group";

type BuildChatGridCandidatesArgs = {
  sessions: SessionSummary[];
  getRepoSortAnchorAt?: (repoRoot: string | null) => number | null;
};

export const buildChatGridCandidates = ({
  sessions,
  getRepoSortAnchorAt,
}: BuildChatGridCandidatesArgs) => {
  const sorted = buildSessionGroups(sessions, { getRepoSortAnchorAt }).flatMap(
    (group) => group.sessions,
  );
  return sorted.filter((session) => isKnownAgent(session.agent));
};
