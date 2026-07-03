import type {
  SessionStateTimeline,
  SessionStateTimelineItem,
  SessionStateTimelineRange,
  SessionStateTimelineSource,
  SessionStateValue,
} from "@vde-monitor/shared";

import { parseIsoToMs } from "../utils/time";

import { prunePane } from "./prune";
import {
  aggregateRepoTimelineSegments,
  buildTimelineBoundaries,
  clipTimelineEventToInterval,
} from "./timeline-aggregation";
import { toIso } from "./timeline-restore";

import type { TimelineState } from "./store";

export const RANGE_MS: Record<SessionStateTimelineRange, number> = {
  "15m": 15 * 60 * 1000,
  "1h": 60 * 60 * 1000,
  "3h": 3 * 60 * 60 * 1000,
  "6h": 6 * 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "3d": 3 * 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "14d": 14 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
};

export const DEFAULT_RETENTION_MS = RANGE_MS["30d"];
const MAX_TIMELINE_ITEMS = 10_000;
const DEFAULT_LIMIT_BY_RANGE: Record<SessionStateTimelineRange, number> = {
  "15m": 200,
  "1h": 300,
  "3h": 700,
  "6h": 1_500,
  "24h": 5_000,
  "3d": 7_000,
  "7d": 10_000,
  "14d": 10_000,
  "30d": 10_000,
};

export type GetTimelineInput = {
  paneId: string;
  range?: SessionStateTimelineRange;
  limit?: number;
};

export type GetRepoTimelineInput = {
  paneId: string;
  paneIds: string[];
  range?: SessionStateTimelineRange;
  limit?: number;
  aggregateReason?: string;
  itemIdPrefix?: string;
};

const createEmptyTotals = (): Record<SessionStateValue, number> => ({
  RUNNING: 0,
  WAITING_INPUT: 0,
  WAITING_PERMISSION: 0,
  SHELL: 0,
  UNKNOWN: 0,
});

const resolveTimelineLimit = (range: SessionStateTimelineRange, limit: number | undefined) => {
  const fallback = DEFAULT_LIMIT_BY_RANGE[range];
  if (limit == null || !Number.isFinite(limit)) {
    return fallback;
  }
  return Math.min(MAX_TIMELINE_ITEMS, Math.max(1, Math.floor(limit)));
};

const TIMELINE_STATE_PRIORITY: SessionStateValue[] = [
  "WAITING_PERMISSION",
  "RUNNING",
  "WAITING_INPUT",
  "SHELL",
  "UNKNOWN",
];

const resolveDominantState = (states: SessionStateValue[]) => {
  for (const state of TIMELINE_STATE_PRIORITY) {
    if (states.includes(state)) {
      return state;
    }
  }
  return "UNKNOWN" as SessionStateValue;
};

const resolveDominantSource = (sources: SessionStateTimelineSource[]) => {
  if (sources.includes("hook")) {
    return "hook" as SessionStateTimelineSource;
  }
  if (sources.includes("restore")) {
    return "restore" as SessionStateTimelineSource;
  }
  return "poll" as SessionStateTimelineSource;
};

export const getTimeline = (
  timelineState: TimelineState,
  { paneId, range = "1h", limit }: GetTimelineInput,
): SessionStateTimeline => {
  const nowMs = timelineState.now().getTime();
  const nowIso = toIso(nowMs);
  prunePane(timelineState, paneId, nowMs);

  const rangeMs = RANGE_MS[range];
  const rangeStartMs = nowMs - rangeMs;
  const resolvedLimit = resolveTimelineLimit(range, limit);

  const events = timelineState.eventsByPane.get(paneId) ?? [];
  const totals = createEmptyTotals();

  const withDuration = events
    .map<SessionStateTimelineItem | null>((event) => {
      const interval = clipTimelineEventToInterval({
        event,
        rangeStartMs,
        nowMs,
        parseIso: parseIsoToMs,
      });
      if (!interval) {
        return null;
      }
      const durationMs = Math.max(0, interval.endedAtMs - interval.startedAtMs);
      totals[event.state] += durationMs;
      return {
        id: event.id,
        paneId: event.paneId,
        state: event.state,
        reason: event.reason,
        startedAt: event.startedAt,
        endedAt: event.endedAt,
        source: event.source,
        durationMs,
      };
    })
    .filter((event): event is SessionStateTimelineItem => event != null)
    .sort((a, b) => {
      const aMs = parseIsoToMs(a.startedAt) ?? 0;
      const bMs = parseIsoToMs(b.startedAt) ?? 0;
      return bMs - aMs;
    });

  const items = withDuration.slice(0, resolvedLimit);
  const current = items.find((item) => item.endedAt == null) ?? null;
  return {
    paneId,
    now: nowIso,
    range,
    items,
    totalsMs: totals,
    current,
  };
};

export const getRepoTimeline = (
  timelineState: TimelineState,
  {
    paneId,
    paneIds,
    range = "1h",
    limit,
    aggregateReason = "repo:aggregate",
    itemIdPrefix = "repo",
  }: GetRepoTimelineInput,
): SessionStateTimeline => {
  const nowMs = timelineState.now().getTime();
  const nowIso = toIso(nowMs);
  const rangeMs = RANGE_MS[range];
  const rangeStartMs = nowMs - rangeMs;
  const resolvedLimit = resolveTimelineLimit(range, limit);
  const totals = createEmptyTotals();

  const uniquePaneIds = Array.from(new Set(paneIds.filter(Boolean)));
  uniquePaneIds.forEach((candidatePaneId) => {
    prunePane(timelineState, candidatePaneId, nowMs);
  });

  const intervals = uniquePaneIds.flatMap((candidatePaneId) => {
    const events = timelineState.eventsByPane.get(candidatePaneId) ?? [];
    return events
      .map((event) =>
        clipTimelineEventToInterval({
          event,
          rangeStartMs,
          nowMs,
          parseIso: parseIsoToMs,
        }),
      )
      .filter((item): item is NonNullable<typeof item> => item != null);
  });

  if (intervals.length === 0) {
    return {
      paneId,
      now: nowIso,
      range,
      items: [],
      totalsMs: totals,
      current: null,
    };
  }

  const boundaries = buildTimelineBoundaries({ rangeStartMs, nowMs, intervals });
  const segments = aggregateRepoTimelineSegments({
    intervals,
    boundaries,
    nowMs,
    resolveDominantState,
    resolveDominantSource,
    aggregateReason,
  });

  const items = segments
    .map<SessionStateTimelineItem>((segment, index) => {
      const durationMs = Math.max(0, segment.endedAtMs - segment.startedAtMs);
      totals[segment.state] += durationMs;
      return {
        id: `${itemIdPrefix}:${paneId}:${segment.startedAtMs}:${index}`,
        paneId,
        state: segment.state,
        reason: segment.reason,
        startedAt: toIso(segment.startedAtMs),
        endedAt: segment.isOpen ? null : toIso(segment.endedAtMs),
        durationMs,
        source: segment.source,
      };
    })
    .sort((left, right) => {
      const leftMs = parseIsoToMs(left.startedAt) ?? 0;
      const rightMs = parseIsoToMs(right.startedAt) ?? 0;
      return rightMs - leftMs;
    })
    .slice(0, resolvedLimit);

  const current = items.find((item) => item.endedAt == null) ?? null;
  return {
    paneId,
    now: nowIso,
    range,
    items,
    totalsMs: totals,
    current,
  };
};
