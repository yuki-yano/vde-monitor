import path from "node:path";

import type {
  SessionStateTimelineRange,
  UsageRepositoryActivityResponse,
} from "@vde-monitor/shared";

import { RANGE_MS } from "../state-timeline/query";
import { parseIsoToMs } from "../utils/time";

type ActivityInterval = {
  id: string;
  paneId: string;
  repoRoot: string | null;
  runId: string | null;
  verified: true;
  startedAt: string;
  endedAt: string | null;
};

type CompletedRun = {
  epoch: string;
  runSeq: number;
  repoRoot: string | null;
  completedAt: string;
  source: ReliableCompletionSource;
};

type ReliableCompletionSource = "hook:stop" | "herdr:done";

type CoverageGap = {
  startedAt: string;
  endedAt: string;
};

export type PersistedRepositoryActivity = {
  trackingStartedAt: string;
  savedAt: string;
  intervals: ActivityInterval[];
  completedRuns: CompletedRun[];
  gaps: CoverageGap[];
};

type StoreOptions = {
  now?: () => Date;
  retentionMs?: number;
};

type ObservePaneInput = {
  paneId: string;
  running: boolean;
  repoRoot: string | null;
  runId: string | null;
  verified: boolean;
  at?: string;
};

type RecordCompletedRunInput = {
  epoch: string;
  runSeq: number;
  repoRoot: string | null;
  source: ReliableCompletionSource;
  at?: string;
};

type RecordCoverageGapInput = {
  startedAt: string;
  endedAt: string;
};

type MutableRepoMetrics = {
  repoRoot: string;
  agentTimeMs: number;
  completedRunCount: number;
  lastActiveAtMs: number;
  intervals: Array<{ startedAtMs: number; endedAtMs: number }>;
};

const toIso = (ms: number) => new Date(ms).toISOString();

const resolveAtMs = (at: string | undefined, fallbackMs: number) => parseIsoToMs(at) ?? fallbackMs;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value != null && typeof value === "object" && !Array.isArray(value);

const isActivityInterval = (value: unknown): value is ActivityInterval => {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.paneId === "string" &&
    (value.repoRoot == null || typeof value.repoRoot === "string") &&
    (value.runId == null || typeof value.runId === "string") &&
    value.verified === true &&
    parseIsoToMs(typeof value.startedAt === "string" ? value.startedAt : null) != null &&
    (value.endedAt == null ||
      parseIsoToMs(typeof value.endedAt === "string" ? value.endedAt : null) != null)
  );
};

const isCompletedRun = (value: unknown): value is CompletedRun => {
  if (!isRecord(value)) return false;
  return (
    typeof value.epoch === "string" &&
    value.epoch.length > 0 &&
    typeof value.runSeq === "number" &&
    Number.isSafeInteger(value.runSeq) &&
    value.runSeq > 0 &&
    (value.repoRoot == null || typeof value.repoRoot === "string") &&
    (value.source === "hook:stop" || value.source === "herdr:done") &&
    parseIsoToMs(typeof value.completedAt === "string" ? value.completedAt : null) != null
  );
};

const completionKey = (epoch: string, runSeq: number) => `${epoch}\0${String(runSeq)}`;

const isCoverageGap = (value: unknown): value is CoverageGap => {
  if (!isRecord(value)) return false;
  const startedAtMs = parseIsoToMs(typeof value.startedAt === "string" ? value.startedAt : null);
  const endedAtMs = parseIsoToMs(typeof value.endedAt === "string" ? value.endedAt : null);
  return startedAtMs != null && endedAtMs != null && endedAtMs >= startedAtMs;
};

const mergeDuration = (intervals: Array<{ startedAtMs: number; endedAtMs: number }>) => {
  if (intervals.length === 0) return 0;
  intervals.sort(
    (left, right) => left.startedAtMs - right.startedAtMs || left.endedAtMs - right.endedAtMs,
  );
  let durationMs = 0;
  let currentStartMs = intervals[0]?.startedAtMs ?? 0;
  let currentEndMs = intervals[0]?.endedAtMs ?? currentStartMs;
  for (let index = 1; index < intervals.length; index += 1) {
    const interval = intervals[index];
    if (!interval) continue;
    if (interval.startedAtMs <= currentEndMs) {
      currentEndMs = Math.max(currentEndMs, interval.endedAtMs);
      continue;
    }
    durationMs += currentEndMs - currentStartMs;
    currentStartMs = interval.startedAtMs;
    currentEndMs = interval.endedAtMs;
  }
  return durationMs + currentEndMs - currentStartMs;
};

export const createRepositoryActivityStore = (options: StoreOptions = {}) => {
  const now = options.now ?? (() => new Date());
  const retentionMs = options.retentionMs ?? RANGE_MS["30d"];
  let trackingStartedAt = now().toISOString();
  let sequence = 0;
  const intervals: ActivityInterval[] = [];
  const completedRuns: CompletedRun[] = [];
  const completedRunIds = new Set<string>();
  const verifiedRunIds = new Set<string>();
  const gaps: CoverageGap[] = [];
  const openIntervalByPane = new Map<string, ActivityInterval>();

  const prune = (nowMs: number) => {
    const thresholdMs = nowMs - retentionMs;
    const retainedIntervals = intervals.filter((interval) => {
      if (interval.endedAt == null) return true;
      return (parseIsoToMs(interval.endedAt) ?? nowMs) >= thresholdMs;
    });
    intervals.splice(0, intervals.length, ...retainedIntervals);
    verifiedRunIds.clear();
    intervals.forEach((interval) => {
      if (interval.runId != null) verifiedRunIds.add(interval.runId);
    });

    const retainedRuns = completedRuns.filter(
      (run) => (parseIsoToMs(run.completedAt) ?? nowMs) >= thresholdMs,
    );
    completedRuns.splice(0, completedRuns.length, ...retainedRuns);
    completedRunIds.clear();
    completedRuns.forEach((run) => completedRunIds.add(completionKey(run.epoch, run.runSeq)));

    const retainedGaps = gaps.filter((gap) => (parseIsoToMs(gap.endedAt) ?? nowMs) >= thresholdMs);
    gaps.splice(0, gaps.length, ...retainedGaps);
  };

  const closeOpenInterval = (paneId: string, atMs: number) => {
    const current = openIntervalByPane.get(paneId);
    if (!current) return atMs;
    const startedAtMs = parseIsoToMs(current.startedAt) ?? atMs;
    const endedAtMs = Math.max(startedAtMs, atMs);
    current.endedAt = toIso(endedAtMs);
    openIntervalByPane.delete(paneId);
    return endedAtMs;
  };

  const observePane = ({ paneId, running, repoRoot, runId, verified, at }: ObservePaneInput) => {
    if (!paneId) return;
    const nowMs = now().getTime();
    const atMs = Math.min(nowMs, resolveAtMs(at, nowMs));
    const current = openIntervalByPane.get(paneId);
    if (!running) {
      closeOpenInterval(paneId, atMs);
      prune(nowMs);
      return;
    }
    const runWasPreviouslyVerified = runId != null && verifiedRunIds.has(runId);
    if (!verified && !runWasPreviouslyVerified) {
      closeOpenInterval(paneId, atMs);
      prune(nowMs);
      return;
    }
    if (current?.repoRoot === repoRoot && current.runId === runId) return;
    const startedAtMs = closeOpenInterval(paneId, atMs);
    sequence += 1;
    const interval: ActivityInterval = {
      id: `${paneId}:${startedAtMs}:${sequence}`,
      paneId,
      repoRoot,
      runId,
      verified: true,
      startedAt: toIso(startedAtMs),
      endedAt: null,
    };
    intervals.push(interval);
    if (runId != null) verifiedRunIds.add(runId);
    openIntervalByPane.set(paneId, interval);
    prune(nowMs);
  };

  const closePane = (paneId: string, at?: string) => {
    const nowMs = now().getTime();
    closeOpenInterval(paneId, Math.min(nowMs, resolveAtMs(at, nowMs)));
    prune(nowMs);
  };

  const recordCompletedRun = ({ epoch, runSeq, repoRoot, source, at }: RecordCompletedRunInput) => {
    if (!epoch || !Number.isSafeInteger(runSeq) || runSeq <= 0) return;
    const key = completionKey(epoch, runSeq);
    if (completedRunIds.has(key)) return;
    const nowMs = now().getTime();
    completedRuns.push({
      epoch,
      runSeq,
      repoRoot,
      completedAt: toIso(Math.min(nowMs, resolveAtMs(at, nowMs))),
      source,
    });
    completedRunIds.add(key);
    prune(nowMs);
  };

  const recordCoverageGap = ({ startedAt, endedAt }: RecordCoverageGapInput) => {
    const nowMs = now().getTime();
    let startedAtMs = Math.min(nowMs, resolveAtMs(startedAt, nowMs));
    let endedAtMs = Math.min(nowMs, resolveAtMs(endedAt, nowMs));
    if (endedAtMs < startedAtMs) {
      [startedAtMs, endedAtMs] = [endedAtMs, startedAtMs];
    }
    if (endedAtMs === startedAtMs) return;

    const retained: CoverageGap[] = [];
    gaps.forEach((gap) => {
      const gapStartMs = parseIsoToMs(gap.startedAt) ?? startedAtMs;
      const gapEndMs = parseIsoToMs(gap.endedAt) ?? endedAtMs;
      if (gapEndMs < startedAtMs || gapStartMs > endedAtMs) {
        retained.push(gap);
        return;
      }
      startedAtMs = Math.min(startedAtMs, gapStartMs);
      endedAtMs = Math.max(endedAtMs, gapEndMs);
    });
    retained.push({ startedAt: toIso(startedAtMs), endedAt: toIso(endedAtMs) });
    gaps.splice(0, gaps.length, ...retained);
    prune(nowMs);
  };

  const serialize = (): PersistedRepositoryActivity => {
    const nowMs = now().getTime();
    prune(nowMs);
    return {
      trackingStartedAt,
      savedAt: toIso(nowMs),
      intervals: intervals.map((interval) => ({ ...interval })),
      completedRuns: completedRuns.map((run) => ({ ...run })),
      gaps: gaps.map((gap) => ({ ...gap })),
    };
  };

  const restore = (value: unknown) => {
    intervals.splice(0);
    completedRuns.splice(0);
    gaps.splice(0);
    completedRunIds.clear();
    verifiedRunIds.clear();
    openIntervalByPane.clear();
    sequence = 0;
    const restoredAtMs = now().getTime();
    trackingStartedAt = toIso(restoredAtMs);
    if (!isRecord(value)) return;
    const persistedTrackingStartedAtMs = parseIsoToMs(
      typeof value.trackingStartedAt === "string" ? value.trackingStartedAt : null,
    );
    const savedAtMs = parseIsoToMs(typeof value.savedAt === "string" ? value.savedAt : null);
    if (
      persistedTrackingStartedAtMs == null ||
      savedAtMs == null ||
      !Array.isArray(value.intervals) ||
      !Array.isArray(value.completedRuns) ||
      !Array.isArray(value.gaps) ||
      !value.intervals.every(isActivityInterval) ||
      !value.completedRuns.every(isCompletedRun) ||
      !value.gaps.every(isCoverageGap)
    ) {
      return;
    }
    trackingStartedAt = toIso(Math.min(persistedTrackingStartedAtMs, restoredAtMs));
    value.intervals.forEach((rawInterval) => {
      const interval = { ...rawInterval };
      if (interval.endedAt == null) {
        const startedAtMs = parseIsoToMs(interval.startedAt) ?? savedAtMs;
        interval.endedAt = toIso(Math.max(startedAtMs, Math.min(savedAtMs, restoredAtMs)));
      }
      intervals.push(interval);
      if (interval.runId != null) verifiedRunIds.add(interval.runId);
      const parsedSequence = Number.parseInt(interval.id.split(":").at(-1) ?? "0", 10);
      if (Number.isSafeInteger(parsedSequence)) sequence = Math.max(sequence, parsedSequence);
    });
    value.completedRuns.forEach((run) => {
      const key = completionKey(run.epoch, run.runSeq);
      if (completedRunIds.has(key)) return;
      completedRunIds.add(key);
      completedRuns.push({ ...run });
    });
    value.gaps.forEach((gap) => gaps.push({ ...gap }));
    if (restoredAtMs > savedAtMs) {
      gaps.push({ startedAt: toIso(savedAtMs), endedAt: toIso(restoredAtMs) });
    }
    prune(restoredAtMs);
  };

  const getActivity = (
    range: SessionStateTimelineRange = "24h",
  ): UsageRepositoryActivityResponse => {
    const rangeEndMs = now().getTime();
    const rangeStartMs = rangeEndMs - RANGE_MS[range];
    prune(rangeEndMs);
    const metricsByRepo = new Map<string, MutableRepoMetrics>();
    let unattributedRunningMs = 0;
    let unattributedCompletedRunCount = 0;

    const getMetrics = (repoRoot: string) => {
      let metrics = metricsByRepo.get(repoRoot);
      if (!metrics) {
        metrics = {
          repoRoot,
          agentTimeMs: 0,
          completedRunCount: 0,
          lastActiveAtMs: rangeStartMs,
          intervals: [],
        };
        metricsByRepo.set(repoRoot, metrics);
      }
      return metrics;
    };

    intervals.forEach((interval) => {
      const rawStartMs = parseIsoToMs(interval.startedAt);
      const rawEndMs = parseIsoToMs(interval.endedAt) ?? rangeEndMs;
      if (rawStartMs == null || rawEndMs <= rangeStartMs || rawStartMs >= rangeEndMs) return;
      const startedAtMs = Math.max(rangeStartMs, rawStartMs);
      const endedAtMs = Math.min(rangeEndMs, rawEndMs);
      if (endedAtMs <= startedAtMs) return;
      const durationMs = endedAtMs - startedAtMs;
      if (interval.repoRoot == null) {
        unattributedRunningMs += durationMs;
        return;
      }
      const metrics = getMetrics(interval.repoRoot);
      metrics.agentTimeMs += durationMs;
      metrics.lastActiveAtMs = Math.max(metrics.lastActiveAtMs, endedAtMs);
      metrics.intervals.push({ startedAtMs, endedAtMs });
    });

    completedRuns.forEach((run) => {
      const completedAtMs = parseIsoToMs(run.completedAt);
      if (completedAtMs == null || completedAtMs < rangeStartMs || completedAtMs > rangeEndMs) {
        return;
      }
      if (run.repoRoot == null) {
        unattributedCompletedRunCount += 1;
        return;
      }
      const metrics = getMetrics(run.repoRoot);
      metrics.completedRunCount += 1;
      metrics.lastActiveAtMs = Math.max(metrics.lastActiveAtMs, completedAtMs);
    });

    const coverageIntervals: Array<{ startedAtMs: number; endedAtMs: number }> = [];
    const trackingStartedAtMs = parseIsoToMs(trackingStartedAt) ?? rangeEndMs;
    if (trackingStartedAtMs > rangeStartMs) {
      coverageIntervals.push({
        startedAtMs: rangeStartMs,
        endedAtMs: Math.min(rangeEndMs, trackingStartedAtMs),
      });
    }
    gaps.forEach((gap) => {
      const startedAtMs = Math.max(rangeStartMs, parseIsoToMs(gap.startedAt) ?? rangeEndMs);
      const endedAtMs = Math.min(rangeEndMs, parseIsoToMs(gap.endedAt) ?? rangeStartMs);
      if (endedAtMs > startedAtMs) coverageIntervals.push({ startedAtMs, endedAtMs });
    });
    const gapDurationMs = mergeDuration(coverageIntervals);
    const rangeEnd = toIso(rangeEndMs);
    return {
      range,
      rangeStart: toIso(rangeStartMs),
      rangeEnd,
      coverage: {
        status: gapDurationMs > 0 ? "partial" : "complete",
        trackingStartedAt,
        gapDurationMs,
        unattributedRunningMs,
        unattributedCompletedRunCount,
      },
      items: [...metricsByRepo.values()]
        .map((metrics) => ({
          repoKey: metrics.repoRoot,
          repoRoot: metrics.repoRoot,
          repoName: path.basename(metrics.repoRoot) || metrics.repoRoot,
          activeTimeMs: mergeDuration(metrics.intervals),
          agentTimeMs: metrics.agentTimeMs,
          completedRunCount: metrics.completedRunCount,
          lastActiveAt: toIso(metrics.lastActiveAtMs),
        }))
        .sort(
          (left, right) =>
            right.activeTimeMs - left.activeTimeMs || left.repoRoot.localeCompare(right.repoRoot),
        ),
      fetchedAt: rangeEnd,
    };
  };

  return {
    observePane,
    closePane,
    recordCompletedRun,
    recordCoverageGap,
    serialize,
    restore,
    getActivity,
  };
};
