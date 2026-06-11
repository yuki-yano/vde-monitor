import type { CodexRateLimitSnapshot } from "../codex-usage/codex-usage-service";

export type CodexWindowCandidate = {
  snapshot: CodexRateLimitSnapshot;
  window: NonNullable<CodexRateLimitSnapshot["primary"]>;
  slot: "primary" | "secondary";
};

export const collectCodexWindowCandidates = (
  baseSnapshot: CodexRateLimitSnapshot,
  byLimitId: Record<string, CodexRateLimitSnapshot> | null,
): CodexWindowCandidate[] => {
  const snapshots = [baseSnapshot, ...Object.values(byLimitId ?? {})];
  const candidates = snapshots.flatMap((snapshot) => {
    const rows: CodexWindowCandidate[] = [];
    if (snapshot.primary) {
      rows.push({
        snapshot,
        window: snapshot.primary,
        slot: "primary",
      });
    }
    if (snapshot.secondary) {
      rows.push({
        snapshot,
        window: snapshot.secondary,
        slot: "secondary",
      });
    }
    return rows;
  });

  const dedup = new Map<string, CodexWindowCandidate>();
  candidates.forEach((candidate) => {
    const key = [
      candidate.snapshot.limitId ?? "none",
      candidate.slot,
      candidate.window.windowDurationMins ?? "none",
      candidate.window.resetsAt ?? "none",
      candidate.window.usedPercent,
    ].join(":");
    dedup.set(key, candidate);
  });
  return Array.from(dedup.values());
};

export const findByDuration = (candidates: CodexWindowCandidate[], durationMins: number) =>
  candidates.filter((candidate) => candidate.window.windowDurationMins === durationMins);

const resolveWindowResetAtMs = (candidate: CodexWindowCandidate): number => {
  const rawResetAt = candidate.window.resetsAt;
  if (rawResetAt == null || !Number.isFinite(rawResetAt)) {
    return Number.POSITIVE_INFINITY;
  }
  return rawResetAt > 1_000_000_000_000 ? rawResetAt : rawResetAt * 1000;
};

export const pickPrimaryWindowCandidate = (
  candidates: CodexWindowCandidate[],
): CodexWindowCandidate | null => {
  if (candidates.length === 0) {
    return null;
  }
  return (
    [...candidates].sort((left, right) => {
      const leftResetAt = resolveWindowResetAtMs(left);
      const rightResetAt = resolveWindowResetAtMs(right);
      if (leftResetAt !== rightResetAt) {
        return leftResetAt - rightResetAt;
      }
      return right.window.usedPercent - left.window.usedPercent;
    })[0] ?? null
  );
};
