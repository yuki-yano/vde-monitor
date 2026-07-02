import { parseIsoToMs } from "../utils/time";

import type {
  SessionStateTimelineItem,
  SessionStateTimelineSource,
  SessionStateValue,
} from "@vde-monitor/shared";

export type TimelineEvent = Omit<SessionStateTimelineItem, "durationMs"> & {
  repoRoot: string | null;
};

export type SessionTimelinePersistedEvent = Omit<TimelineEvent, "repoRoot"> & {
  repoRoot?: string | null;
};

export type SessionTimelinePersistedEvents = Record<string, SessionTimelinePersistedEvent[]>;

export const toIso = (ms: number) => new Date(ms).toISOString();

export const parseSequenceFromId = (id: string): number => {
  const candidate = id.split(":").at(-1);
  if (!candidate) {
    return 0;
  }
  const parsed = Number.parseInt(candidate, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }
  return parsed;
};

/**
 * Pure function: normalises raw persisted events for a single pane into a sorted,
 * gap-free list of TimelineEvents. Returns the normalised events and the highest
 * sequence number seen (so the store can update its global sequence counter).
 */
export const normalizeRestoredPaneEvents = (
  paneId: string,
  rawEvents: SessionTimelinePersistedEvent[],
): { events: TimelineEvent[]; maxSequence: number } => {
  const sorted = rawEvents
    .map((event) => {
      const startedAtMs = parseIsoToMs(event.startedAt);
      if (startedAtMs == null) {
        return null;
      }
      return {
        id:
          typeof event.id === "string" && event.id.length > 0
            ? event.id
            : `${paneId}:${startedAtMs}:0`,
        paneId,
        state: event.state as SessionStateValue,
        reason: event.reason,
        source: event.source as SessionStateTimelineSource,
        repoRoot: typeof event.repoRoot === "string" ? event.repoRoot : null,
        startedAtMs,
        endedAtMs: parseIsoToMs(event.endedAt),
      };
    })
    .filter(
      (
        event,
      ): event is {
        id: string;
        paneId: string;
        state: SessionStateValue;
        reason: string;
        source: SessionStateTimelineSource;
        repoRoot: string | null;
        startedAtMs: number;
        endedAtMs: number | null;
      } => event != null,
    )
    .sort((a, b) => a.startedAtMs - b.startedAtMs);

  const restored: TimelineEvent[] = [];
  let lastBoundaryMs = Number.NEGATIVE_INFINITY;
  let maxSequence = 0;

  sorted.forEach((event, index) => {
    const next = sorted[index + 1];
    const nextStartMs = next?.startedAtMs ?? null;
    const startedAtMs = Math.max(event.startedAtMs, lastBoundaryMs);
    let endedAtMs = event.endedAtMs;
    if (endedAtMs == null && nextStartMs != null) {
      endedAtMs = nextStartMs;
    }
    if (endedAtMs != null) {
      endedAtMs = Math.max(endedAtMs, startedAtMs);
    }
    if (endedAtMs != null && endedAtMs === startedAtMs) {
      return;
    }
    restored.push({
      id: event.id,
      paneId,
      state: event.state,
      reason: event.reason,
      repoRoot: event.repoRoot,
      startedAt: toIso(startedAtMs),
      endedAt: endedAtMs == null ? null : toIso(endedAtMs),
      source: event.source,
    });
    maxSequence = Math.max(maxSequence, parseSequenceFromId(event.id));
    lastBoundaryMs = endedAtMs ?? startedAtMs;
  });

  return { events: restored, maxSequence };
};
