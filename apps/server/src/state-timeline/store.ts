import { type ClosePaneInput, closePane as closePaneEvent, prunePane } from "./prune";
import {
  DEFAULT_RETENTION_MS,
  type GetRepoTimelineInput,
  type GetTimelineInput,
  getTimeline as queryPaneTimeline,
  getRepoTimeline as queryRepoTimeline,
} from "./query";
import { type RecordStateTransitionInput, recordStateTransition } from "./record";
import {
  type SessionTimelinePersistedEvent,
  type SessionTimelinePersistedEvents,
  normalizeRestoredPaneEvents,
} from "./timeline-restore";
import type { TimelineState } from "./types";

type StoreOptions = {
  now?: () => Date;
  retentionMs?: number;
};

export const createSessionTimelineStore = (options: StoreOptions = {}) => {
  const timelineState: TimelineState = {
    eventsByPane: new Map(),
    sequence: 0,
    now: options.now ?? (() => new Date()),
    retentionMs: options.retentionMs ?? DEFAULT_RETENTION_MS,
  };

  const record = (input: RecordStateTransitionInput) => recordStateTransition(timelineState, input);

  const closePane = (input: ClosePaneInput) => closePaneEvent(timelineState, input);

  const getTimeline = (input: GetTimelineInput) => queryPaneTimeline(timelineState, input);

  const getRepoTimeline = (input: GetRepoTimelineInput) => queryRepoTimeline(timelineState, input);

  const reset = () => {
    timelineState.eventsByPane.clear();
  };

  const serialize = (): SessionTimelinePersistedEvents => {
    const nowMs = timelineState.now().getTime();
    timelineState.eventsByPane.forEach((_events, paneId) => {
      prunePane(timelineState, paneId, nowMs);
    });
    const output: SessionTimelinePersistedEvents = {};
    timelineState.eventsByPane.forEach((events, paneId) => {
      if (events.length === 0) {
        return;
      }
      output[paneId] = events.map((event) => ({ ...event }));
    });
    return output;
  };

  const restore = (
    persisted:
      | SessionTimelinePersistedEvents
      | Map<string, SessionTimelinePersistedEvent[]>
      | null
      | undefined,
  ) => {
    timelineState.eventsByPane.clear();
    timelineState.sequence = 0;
    if (!persisted) {
      return;
    }

    const entries =
      persisted instanceof Map ? Array.from(persisted.entries()) : Object.entries(persisted);
    entries.forEach(([paneId, events]) => {
      if (!paneId || !Array.isArray(events)) {
        return;
      }
      const { events: restored, maxSequence } = normalizeRestoredPaneEvents(paneId, events);
      if (restored.length > 0) {
        timelineState.eventsByPane.set(paneId, restored);
      }
      timelineState.sequence = Math.max(timelineState.sequence, maxSequence);
    });

    const nowMs = timelineState.now().getTime();
    timelineState.eventsByPane.forEach((_events, paneId) => {
      prunePane(timelineState, paneId, nowMs);
    });
  };

  return {
    record,
    closePane,
    getTimeline,
    getRepoTimeline,
    reset,
    serialize,
    restore,
  };
};
