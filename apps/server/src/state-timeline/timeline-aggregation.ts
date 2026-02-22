import type { SessionStateTimelineSource, SessionStateValue } from "@vde-monitor/shared";

type TimelineEventLike = {
  state: SessionStateValue;
  source: SessionStateTimelineSource;
  reason: string;
  startedAt: string;
  endedAt: string | null;
};

type ParseIso = (value: string | null | undefined) => number | null;

export type TimelineInterval = {
  state: SessionStateValue;
  source: SessionStateTimelineSource;
  reason: string;
  startedAtMs: number;
  endedAtMs: number;
  isOpen: boolean;
};

export const clipTimelineEventToInterval = ({
  event,
  rangeStartMs,
  nowMs,
  parseIso,
}: {
  event: TimelineEventLike;
  rangeStartMs: number;
  nowMs: number;
  parseIso: ParseIso;
}): TimelineInterval | null => {
  const startedAtMs = parseIso(event.startedAt);
  if (startedAtMs == null) {
    return null;
  }
  const endedAtMs = parseIso(event.endedAt) ?? nowMs;
  const clippedStartMs = Math.max(startedAtMs, rangeStartMs);
  const clippedEndMs = Math.min(endedAtMs, nowMs);
  if (clippedEndMs <= clippedStartMs) {
    return null;
  }
  return {
    state: event.state,
    source: event.source,
    reason: event.reason,
    startedAtMs: clippedStartMs,
    endedAtMs: clippedEndMs,
    isOpen: event.endedAt == null && clippedEndMs === nowMs,
  };
};

export const buildTimelineBoundaries = ({
  rangeStartMs,
  nowMs,
  intervals,
}: {
  rangeStartMs: number;
  nowMs: number;
  intervals: TimelineInterval[];
}) => {
  return Array.from(
    new Set([
      rangeStartMs,
      nowMs,
      ...intervals.flatMap((interval) => [interval.startedAtMs, interval.endedAtMs]),
    ]),
  ).sort((left, right) => left - right);
};

export type AggregateRepoTimelineSegment = {
  state: SessionStateValue;
  startedAtMs: number;
  endedAtMs: number;
  isOpen: boolean;
  source: SessionStateTimelineSource;
  reason: string;
};

export const aggregateRepoTimelineSegments = ({
  intervals,
  boundaries,
  nowMs,
  resolveDominantState,
  resolveDominantSource,
  aggregateReason = "repo:aggregate",
}: {
  intervals: TimelineInterval[];
  boundaries: number[];
  nowMs: number;
  resolveDominantState: (states: SessionStateValue[]) => SessionStateValue;
  resolveDominantSource: (sources: SessionStateTimelineSource[]) => SessionStateTimelineSource;
  aggregateReason?: string;
}) => {
  const segments: AggregateRepoTimelineSegment[] = [];
  for (let index = 0; index < boundaries.length - 1; index += 1) {
    const segmentStartMs = boundaries[index];
    const segmentEndMs = boundaries[index + 1];
    if (segmentStartMs == null || segmentEndMs == null || segmentEndMs <= segmentStartMs) {
      continue;
    }

    const activeIntervals = intervals.filter(
      (interval) => interval.startedAtMs < segmentEndMs && interval.endedAtMs > segmentStartMs,
    );
    if (activeIntervals.length === 0) {
      continue;
    }

    const dominantState = resolveDominantState(activeIntervals.map((interval) => interval.state));
    const dominantSource = resolveDominantSource(
      activeIntervals.map((interval) => interval.source),
    );
    const isOpen =
      segmentEndMs === nowMs &&
      activeIntervals.some((interval) => interval.isOpen && interval.endedAtMs === nowMs);

    const previous = segments.at(-1);
    if (
      previous &&
      previous.state === dominantState &&
      previous.endedAtMs === segmentStartMs &&
      previous.isOpen === isOpen
    ) {
      previous.endedAtMs = segmentEndMs;
      previous.source = dominantSource;
      continue;
    }

    segments.push({
      state: dominantState,
      startedAtMs: segmentStartMs,
      endedAtMs: segmentEndMs,
      isOpen,
      source: dominantSource,
      reason: aggregateReason,
    });
  }
  return segments;
};
