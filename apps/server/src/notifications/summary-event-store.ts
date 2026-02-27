import fs from "node:fs/promises";

import { type SummaryEvent, summaryEventSchema } from "@vde-monitor/shared";

type LoggerLike = Pick<Console, "log">;

type WaitForSummaryInput = {
  paneId: string;
  paneTty: string | null;
  cwd: string | null;
  sourceAgent: "codex" | "claude";
  transitionAt: string;
  waitMs: number;
};

type WaitForSummaryResult = {
  event: SummaryEvent;
  waitedMs: number;
} | null;

type CreateSummaryEventStoreOptions = {
  filePath: string;
  nowMs?: () => number;
  sleep?: (ms: number) => Promise<void>;
  logger?: LoggerLike;
  pollIntervalMs?: number;
};

const DEFAULT_POLL_INTERVAL_MS = 100;
const MAX_EVENT_COUNT = 2000;

const toEpochMs = (value: string, fallbackMs: number) => {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return fallbackMs;
  }
  return parsed;
};

const resolveLocatorKey = (
  locator: SummaryEvent["pane_locator"],
  input: Pick<WaitForSummaryInput, "paneId" | "paneTty" | "cwd">,
) => {
  if (locator.tmux_pane != null) {
    return locator.tmux_pane === input.paneId;
  }
  if (locator.tty != null) {
    return input.paneTty != null && locator.tty === input.paneTty;
  }
  if (locator.cwd != null) {
    return input.cwd != null && locator.cwd === input.cwd;
  }
  return false;
};

export const createSummaryEventStore = ({
  filePath,
  nowMs = () => Date.now(),
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  logger = console,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
}: CreateSummaryEventStoreOptions) => {
  let offset = 0;
  let buffer = "";
  const events: SummaryEvent[] = [];
  let refreshPromise: Promise<void> | null = null;

  const readNewLines = async () => {
    const stat = await fs.stat(filePath).catch(() => null);
    if (!stat) {
      return [];
    }
    if (stat.size < offset) {
      offset = 0;
      buffer = "";
      events.length = 0;
    }
    if (stat.size === offset) {
      return [];
    }
    const fd = await fs.open(filePath, "r");
    try {
      const length = stat.size - offset;
      const chunk = Buffer.alloc(length);
      await fd.read(chunk, 0, length, offset);
      offset = stat.size;
      buffer += chunk.toString("utf8");
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      return lines.filter((line) => line.trim().length > 0);
    } finally {
      await fd.close();
    }
  };

  const ingestLines = (lines: string[]) => {
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        const validated = summaryEventSchema.safeParse(parsed);
        if (!validated.success) {
          continue;
        }
        events.push(validated.data);
      } catch {
        continue;
      }
    }
    if (events.length > MAX_EVENT_COUNT) {
      events.splice(0, events.length - MAX_EVENT_COUNT);
    }
  };

  const refresh = async () => {
    if (refreshPromise) {
      return refreshPromise;
    }
    refreshPromise = (async () => {
      const lines = await readNewLines();
      ingestLines(lines);
    })().finally(() => {
      refreshPromise = null;
    });
    await refreshPromise;
  };

  const selectCandidate = (
    input: WaitForSummaryInput,
    rejectedSummaryIds: Set<string>,
  ): SummaryEvent | null => {
    const transitionAtMs = toEpochMs(input.transitionAt, nowMs());
    const deadlineAtMs = transitionAtMs + input.waitMs;
    const candidates: Array<{ event: SummaryEvent; sourceEventAtMs: number }> = [];

    for (const event of events) {
      if (!resolveLocatorKey(event.pane_locator, input)) {
        continue;
      }

      let rejectedReason: "source_mismatch" | "stale" | "out_of_window" | null = null;
      if (event.source_agent !== input.sourceAgent) {
        rejectedReason = "source_mismatch";
      } else {
        const sourceEventAtMs = toEpochMs(event.source_event_at, Number.NEGATIVE_INFINITY);
        if (sourceEventAtMs < transitionAtMs) {
          rejectedReason = "stale";
        } else if (sourceEventAtMs > deadlineAtMs) {
          rejectedReason = "out_of_window";
        } else {
          candidates.push({
            event,
            sourceEventAtMs,
          });
        }
      }

      if (rejectedReason && !rejectedSummaryIds.has(event.summary_id)) {
        rejectedSummaryIds.add(event.summary_id);
        logger.log(
          `[vde-monitor][push] summary_candidate_rejected paneId=${input.paneId} source=${input.sourceAgent} summaryId=${event.summary_id} reason=${rejectedReason}`,
        );
      }
    }

    if (candidates.length === 0) {
      return null;
    }

    candidates.sort((left, right) => {
      if (left.sourceEventAtMs !== right.sourceEventAtMs) {
        return left.sourceEventAtMs - right.sourceEventAtMs;
      }
      return left.event.summary_id.localeCompare(right.event.summary_id);
    });
    return candidates[0]?.event ?? null;
  };

  const waitForSummary = async (input: WaitForSummaryInput): Promise<WaitForSummaryResult> => {
    const transitionAtMs = toEpochMs(input.transitionAt, nowMs());
    const deadlineAtMs = transitionAtMs + Math.max(0, input.waitMs);
    const startedAtMs = nowMs();
    logger.log(
      `[vde-monitor][push] summary_wait_started paneId=${input.paneId} source=${input.sourceAgent} waitMs=${Math.max(0, input.waitMs)}`,
    );
    const rejectedSummaryIds = new Set<string>();

    while (true) {
      await refresh();
      const candidate = selectCandidate(input, rejectedSummaryIds);
      if (candidate) {
        const waitedMs = Math.max(0, nowMs() - startedAtMs);
        logger.log(
          `[vde-monitor][push] summary_wait_hit paneId=${input.paneId} source=${input.sourceAgent} waitedMs=${waitedMs} summaryId=${candidate.summary_id}`,
        );
        return {
          event: candidate,
          waitedMs,
        };
      }
      const now = nowMs();
      if (now >= deadlineAtMs) {
        logger.log(
          `[vde-monitor][push] summary_wait_timeout paneId=${input.paneId} source=${input.sourceAgent} waitMs=${Math.max(0, input.waitMs)}`,
        );
        return null;
      }
      await sleep(Math.max(1, Math.min(pollIntervalMs, deadlineAtMs - now)));
    }
  };

  return {
    waitForSummary,
  };
};

export type SummaryEventStore = ReturnType<typeof createSummaryEventStore>;
