import type { SessionDetail, SessionStateValue } from "@vde-monitor/shared";

import type { PersistedSessionMap, PersistedTimelineMap } from "../state-store";
import type { PaneRuntimeState } from "./pane-state";

type PaneStateStoreLike = {
  get: (paneId: string) => PaneRuntimeState;
};

type TimelineStoreLike = {
  restore: (persisted: PersistedTimelineMap) => void;
  record: (event: {
    paneId: string;
    state: SessionStateValue;
    reason: string;
    repoRoot?: string | null;
    at?: string;
    source: "restore";
  }) => void;
};

type RestoreMonitorRuntimeStateArgs = {
  restoredSessions: PersistedSessionMap;
  restoredTimeline: PersistedTimelineMap;
  paneStates: PaneStateStoreLike;
  customTitles: Map<string, string>;
  stateTimeline: TimelineStoreLike;
};

export const restoreMonitorRuntimeState = ({
  restoredSessions,
  restoredTimeline,
  paneStates,
  customTitles,
  stateTimeline,
}: RestoreMonitorRuntimeStateArgs) => {
  stateTimeline.restore(restoredTimeline);
  restoredSessions.forEach((session, paneId) => {
    const state = paneStates.get(paneId);
    state.lastOutputAt = session.lastOutputAt ?? null;
    state.lastEventAt = session.lastEventAt ?? null;
    state.lastMessage = session.lastMessage ?? null;
    state.lastInputAt = session.lastInputAt ?? null;
    state.agentSessionId = session.agentSessionId ?? null;
    state.agentSessionSource = session.agentSessionSource ?? null;
    state.agentSessionConfidence = session.agentSessionConfidence ?? null;
    state.agentSessionObservedAt = session.agentSessionObservedAt ?? null;
    if (session.customTitle) {
      customTitles.set(paneId, session.customTitle);
    }
    if (!restoredTimeline.has(paneId)) {
      stateTimeline.record({
        paneId,
        state: session.state,
        reason: session.stateReason || "restored",
        repoRoot: session.repoRoot ?? null,
        at: session.lastEventAt ?? session.lastOutputAt ?? session.lastInputAt ?? undefined,
        source: "restore",
      });
    }
  });
};

export const createRestoredSessionApplier = (restoredSessions: PersistedSessionMap) => {
  const restoredReason = new Set<string>();

  return (paneId: string): SessionDetail | null => {
    if (restoredSessions.has(paneId) && !restoredReason.has(paneId)) {
      restoredReason.add(paneId);
      return (restoredSessions.get(paneId) as SessionDetail | undefined) ?? null;
    }
    return null;
  };
};
