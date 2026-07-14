import type { SessionStateValue } from "@vde-monitor/shared";

import type {
  PersistedSessionMap,
  PersistedSessionRuntimeState,
  PersistedTimelineMap,
} from "../state-store";
import type { PaneRuntimeState } from "./pane-state";

type PaneStateStoreLike = {
  get: (paneId: string) => PaneRuntimeState;
};

type TimelineStoreLike = {
  restore(persisted: PersistedTimelineMap): void;
  record(event: {
    paneId: string;
    state: SessionStateValue;
    reason: string;
    repoRoot?: string | null;
    at?: string;
    source: "restore";
  }): void;
};

type RestoreMonitorRuntimeStateArgs = {
  restoredSessions: PersistedSessionMap;
  restoredTimeline: PersistedTimelineMap;
  paneStates: PaneStateStoreLike;
  customTitles: Map<string, string>;
  stateTimeline: TimelineStoreLike;
};

export const resolvePersistedSessionRuntimeState = (
  state: PaneRuntimeState,
): PersistedSessionRuntimeState => {
  const completionCursor = state.completionCursor ?? state.pendingRestoredCompletionCursor;
  const pendingFallback = state.completionCursor == null && completionCursor != null;
  return {
    lifecycle: pendingFallback
      ? (state.pendingRestoredLifecycle ?? state.lifecycle)
      : state.lifecycle,
    completionCursor,
    lastAgent: pendingFallback
      ? (state.pendingRestoredLastAgent ?? state.lastResolvedAgent)
      : state.lastResolvedAgent,
  };
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
    const completionCursor =
      session.completionCursor == null ? null : { ...session.completionCursor };
    state.lastOutputAt = session.lastOutputAt ?? null;
    state.lastEventAt = session.lastEventAt ?? null;
    state.lastMessage = session.lastMessage ?? null;
    state.lastInputAt = session.lastInputAt ?? null;
    state.lastRunStartedAt = session.lastRunStartedAt ?? null;
    state.manualSortAt = session.manualSortAt ?? null;
    state.lifecycle = session.lifecycle;
    state.completionCursor = completionCursor;
    state.pendingRestoredCompletionCursor =
      completionCursor == null ? null : { ...completionCursor };
    state.pendingRestoredLifecycle = session.lifecycle;
    state.pendingRestoredLastAgent = session.lastAgent;
    state.lastResolvedAgent =
      session.lastAgent === "unknown" && completionCursor != null
        ? completionCursor.agent
        : session.lastAgent;
    state.agentPresent = completionCursor?.agentPresent ?? false;
    state.consecutiveAbsentObservations = completionCursor?.consecutiveAbsentObservations ?? 0;
    state.lastResolvedState = session.lifecycle;
    state.lastResolvedStateReason = session.stateReason;
    if (session.customTitle) {
      customTitles.set(paneId, session.customTitle);
    }
    if (!restoredTimeline.has(paneId)) {
      stateTimeline.record({
        paneId,
        state: session.lifecycle,
        reason: session.stateReason || "restored",
        repoRoot: session.repoRoot ?? null,
        at: session.lastEventAt ?? session.lastOutputAt ?? session.lastInputAt ?? undefined,
        source: "restore",
      });
    }
  });
};
