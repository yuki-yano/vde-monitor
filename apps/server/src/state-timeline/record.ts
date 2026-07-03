import type { SessionStateTimelineSource, SessionStateValue } from "@vde-monitor/shared";

import { parseIsoToMs } from "../utils/time";

import { prunePane, resolveAtMs } from "./prune";
import { type TimelineEvent, toIso } from "./timeline-restore";

import type { TimelineState } from "./store";

export type RecordStateTransitionInput = {
  paneId: string;
  state: SessionStateValue;
  reason: string;
  repoRoot?: string | null;
  at?: string;
  source?: SessionStateTimelineSource;
};

const nextId = (timelineState: TimelineState, paneId: string, startedAtMs: number) => {
  timelineState.sequence += 1;
  return `${paneId}:${startedAtMs}:${timelineState.sequence}`;
};

const getOrCreatePaneEvents = (timelineState: TimelineState, paneId: string): TimelineEvent[] => {
  const existing = timelineState.eventsByPane.get(paneId);
  if (existing) {
    return existing;
  }
  const next: TimelineEvent[] = [];
  timelineState.eventsByPane.set(paneId, next);
  return next;
};

export const recordStateTransition = (
  timelineState: TimelineState,
  { paneId, state, reason, repoRoot = null, at, source = "poll" }: RecordStateTransitionInput,
) => {
  if (!paneId) {
    return;
  }
  const nowMs = timelineState.now().getTime();
  const events = getOrCreatePaneEvents(timelineState, paneId);
  prunePane(timelineState, paneId, nowMs);

  let atMs = resolveAtMs(at, nowMs);
  const last = events.at(-1);
  if (last) {
    const lastStartMs = parseIsoToMs(last.startedAt) ?? atMs;
    const lastBoundaryMs = parseIsoToMs(last.endedAt) ?? lastStartMs;
    if (atMs < lastBoundaryMs) {
      atMs = lastBoundaryMs;
    }

    if (!last.endedAt) {
      if (
        last.state === state &&
        last.reason === reason &&
        last.source === source &&
        last.repoRoot === repoRoot
      ) {
        return;
      }
      const closeAtMs = Math.max(lastStartMs, atMs);
      last.endedAt = toIso(closeAtMs);
    }
  }

  events.push({
    id: nextId(timelineState, paneId, atMs),
    paneId,
    state,
    reason,
    repoRoot,
    startedAt: toIso(atMs),
    endedAt: null,
    source,
  });
  prunePane(timelineState, paneId, nowMs);
};
