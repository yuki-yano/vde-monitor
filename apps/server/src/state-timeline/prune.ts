import { parseIsoToMs } from "../utils/time";

import { toIso } from "./timeline-restore";

import type { TimelineState } from "./store";

export type ClosePaneInput = {
  paneId: string;
  at?: string;
};

export const resolveAtMs = (at: string | undefined, fallbackMs: number) => {
  const parsed = parseIsoToMs(at);
  return parsed == null ? fallbackMs : parsed;
};

export const prunePane = (timelineState: TimelineState, paneId: string, nowMs: number) => {
  const events = timelineState.eventsByPane.get(paneId);
  if (!events || events.length === 0) {
    return;
  }
  const thresholdMs = nowMs - timelineState.retentionMs;
  const retained = events.filter((event) => {
    if (!event.endedAt) {
      return true;
    }
    const endedAtMs = parseIsoToMs(event.endedAt);
    if (endedAtMs == null) {
      return true;
    }
    return endedAtMs >= thresholdMs;
  });

  events.splice(0, events.length, ...retained);
};

export const closePane = (timelineState: TimelineState, { paneId, at }: ClosePaneInput) => {
  if (!paneId) {
    return;
  }
  const events = timelineState.eventsByPane.get(paneId);
  if (!events || events.length === 0) {
    return;
  }
  const last = events.at(-1);
  if (!last || last.endedAt) {
    return;
  }
  const nowMs = timelineState.now().getTime();
  const startedAtMs = parseIsoToMs(last.startedAt) ?? nowMs;
  const atMs = resolveAtMs(at, nowMs);
  last.endedAt = toIso(Math.max(startedAtMs, atMs));
  prunePane(timelineState, paneId, nowMs);
};
