import type { SummaryPublishLocator, SummaryPublishRequest } from "@vde-monitor/shared";

type SummaryBindingLocator = Pick<
  SummaryPublishLocator,
  "source" | "runId" | "paneId" | "eventType" | "sequence"
>;

type SummaryBusWaitInput = {
  binding: SummaryBindingLocator;
  minSourceEventAt: string;
  waitMs: number;
};

type SummaryBusHitResult = {
  result: "hit";
  waitedMs: number;
  event: {
    eventId: string;
    locator: SummaryPublishLocator;
    sourceEventAt: string;
    summary: SummaryPublishRequest["summary"];
  };
};

type SummaryBusTimeoutResult = {
  result: "timeout";
  waitedMs: number;
};

type SummaryBusRejectedResult = {
  result: "rejected";
  waitedMs: number;
  reasonCode: "waiter_overflow";
};

export type SummaryBusWaitResult =
  | SummaryBusHitResult
  | SummaryBusTimeoutResult
  | SummaryBusRejectedResult;

type SummaryBusPublishSuccess = {
  ok: true;
  eventId: string;
  deduplicated: boolean;
};

type SummaryBusPublishFailure = {
  ok: false;
  code: "invalid_request" | "max_events_overflow";
  message: string;
  eventId?: string;
};

export type SummaryBusPublishResult = SummaryBusPublishSuccess | SummaryBusPublishFailure;

type CreateSummaryBusOptions = {
  nowMs?: () => number;
  setTimer?: (cb: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimer?: (timer: ReturnType<typeof setTimeout>) => void;
  maxEvents?: number;
  maxEventsPerBinding?: number;
  maxWaiters?: number;
  bufferMs?: number;
};

type BufferedEvent = {
  eventId: string;
  locator: SummaryPublishLocator;
  locatorKey: string;
  bindingKey: string;
  sourceEventAt: string;
  sourceEventAtMs: number;
  summary: SummaryPublishRequest["summary"];
  expiresAtMs: number;
  publishedAtMs: number;
};

type Waiter = {
  id: number;
  minSourceEventAtMs: number;
  deadlineAtMs: number;
  expectedSequence: number;
  startedAtMs: number;
  resolve: (result: SummaryBusWaitResult) => void;
  timer: ReturnType<typeof setTimeout>;
};

type EventIdIndexValue = {
  bindingKey: string;
  locatorKey: string;
  expiresAtMs: number;
};

type LocatorIndexValue = {
  eventId: string;
  expiresAtMs: number;
};

const DEFAULT_MAX_EVENTS = 2000;
const DEFAULT_MAX_EVENTS_PER_BINDING = 200;
const DEFAULT_MAX_WAITERS = 200;
const DEFAULT_BUFFER_MS = 30_000;
const MAX_SEQUENCE_SKEW_MS = 2_000;

const toBindingKey = (binding: SummaryBindingLocator) =>
  `${binding.source}\u0000${binding.runId}\u0000${binding.paneId}\u0000${binding.eventType}`;

const toLocatorKey = (locator: SummaryPublishLocator) =>
  `${locator.source}\u0000${locator.runId}\u0000${locator.paneId}\u0000${locator.eventType}\u0000${locator.sequence}`;

const safeParseDate = (value: string, fallback: number) => {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return parsed;
};

const compareBufferedEvents = (left: BufferedEvent, right: BufferedEvent) => {
  if (left.sourceEventAtMs !== right.sourceEventAtMs) {
    return left.sourceEventAtMs - right.sourceEventAtMs;
  }
  return left.eventId.localeCompare(right.eventId);
};

export const createSummaryBus = ({
  nowMs = () => Date.now(),
  setTimer = (cb, ms) => setTimeout(cb, ms),
  clearTimer = (timer) => clearTimeout(timer),
  maxEvents = DEFAULT_MAX_EVENTS,
  maxEventsPerBinding = DEFAULT_MAX_EVENTS_PER_BINDING,
  maxWaiters = DEFAULT_MAX_WAITERS,
  bufferMs = DEFAULT_BUFFER_MS,
}: CreateSummaryBusOptions = {}) => {
  const eventsByBindingKey = new Map<string, BufferedEvent[]>();
  const waitersByBindingKey = new Map<string, Waiter[]>();
  const eventIdIndex = new Map<string, EventIdIndexValue>();
  const locatorIndex = new Map<string, LocatorIndexValue>();
  let totalEventCount = 0;
  let totalWaiterCount = 0;
  let nextWaiterId = 1;

  const removeBufferedEvent = (event: BufferedEvent) => {
    const bucket = eventsByBindingKey.get(event.bindingKey);
    if (!bucket) {
      return;
    }
    const index = bucket.findIndex((item) => item.eventId === event.eventId);
    if (index < 0) {
      return;
    }
    bucket.splice(index, 1);
    totalEventCount = Math.max(0, totalEventCount - 1);
    if (bucket.length === 0) {
      eventsByBindingKey.delete(event.bindingKey);
    }
  };

  const cleanup = (now: number) => {
    const expiredEvents: BufferedEvent[] = [];
    for (const bucket of eventsByBindingKey.values()) {
      for (const event of bucket) {
        if (event.expiresAtMs <= now) {
          expiredEvents.push(event);
        }
      }
    }
    expiredEvents.forEach((event) => removeBufferedEvent(event));

    for (const [eventId, value] of eventIdIndex.entries()) {
      if (value.expiresAtMs <= now) {
        eventIdIndex.delete(eventId);
      }
    }

    for (const [locatorKey, value] of locatorIndex.entries()) {
      if (value.expiresAtMs <= now) {
        locatorIndex.delete(locatorKey);
      }
    }
  };

  const findCandidateMatch = ({
    bucket,
    minSourceEventAtMs,
    deadlineAtMs,
    expectedSequence,
  }: {
    bucket: BufferedEvent[];
    minSourceEventAtMs: number;
    deadlineAtMs: number;
    expectedSequence: number;
  }) => {
    let bestIndex = -1;
    let bestSequenceDelta = Number.POSITIVE_INFINITY;
    for (let index = 0; index < bucket.length; index += 1) {
      const event = bucket[index];
      if (!event) {
        continue;
      }
      if (event.sourceEventAtMs < minSourceEventAtMs || event.sourceEventAtMs > deadlineAtMs) {
        continue;
      }
      const sequenceDeltaMs = Math.abs(event.locator.sequence - expectedSequence);
      if (sequenceDeltaMs > MAX_SEQUENCE_SKEW_MS) {
        continue;
      }
      if (sequenceDeltaMs < bestSequenceDelta) {
        bestIndex = index;
        bestSequenceDelta = sequenceDeltaMs;
        continue;
      }
      if (sequenceDeltaMs > bestSequenceDelta) {
        continue;
      }
      const currentBest = bucket[bestIndex];
      if (!currentBest) {
        bestIndex = index;
        continue;
      }
      if (compareBufferedEvents(event, currentBest) < 0) {
        bestIndex = index;
      }
    }
    if (bestIndex < 0) {
      return null;
    }
    return {
      eventIndex: bestIndex,
      sequenceDeltaMs: bestSequenceDelta,
    };
  };

  const popEventAt = (bindingKey: string, eventIndex: number): BufferedEvent | null => {
    const bucket = eventsByBindingKey.get(bindingKey);
    if (!bucket || eventIndex < 0 || eventIndex >= bucket.length) {
      return null;
    }
    const [candidate] = bucket.splice(eventIndex, 1);
    if (!candidate) {
      return null;
    }
    totalEventCount = Math.max(0, totalEventCount - 1);
    if (bucket.length === 0) {
      eventsByBindingKey.delete(bindingKey);
    }
    return candidate;
  };

  const popCandidate = ({
    bindingKey,
    minSourceEventAtMs,
    deadlineAtMs,
    expectedSequence,
  }: {
    bindingKey: string;
    minSourceEventAtMs: number;
    deadlineAtMs: number;
    expectedSequence: number;
  }): BufferedEvent | null => {
    const bucket = eventsByBindingKey.get(bindingKey);
    if (!bucket || bucket.length === 0) {
      return null;
    }
    const match = findCandidateMatch({
      bucket,
      minSourceEventAtMs,
      deadlineAtMs,
      expectedSequence,
    });
    if (!match) {
      return null;
    }
    return popEventAt(bindingKey, match.eventIndex);
  };

  const finishWaiter = ({
    waiter,
    bindingKey,
    result,
  }: {
    waiter: Waiter;
    bindingKey: string;
    result: SummaryBusWaitResult;
  }) => {
    const queue = waitersByBindingKey.get(bindingKey);
    if (queue) {
      const index = queue.findIndex((item) => item.id === waiter.id);
      if (index >= 0) {
        queue.splice(index, 1);
        totalWaiterCount = Math.max(0, totalWaiterCount - 1);
      }
      if (queue.length === 0) {
        waitersByBindingKey.delete(bindingKey);
      }
    }
    clearTimer(waiter.timer);
    waiter.resolve(result);
  };

  const wakeWaiters = (bindingKey: string, now: number) => {
    while (true) {
      const queue = waitersByBindingKey.get(bindingKey);
      const bucket = eventsByBindingKey.get(bindingKey);
      if (!queue || queue.length === 0 || !bucket || bucket.length === 0) {
        return;
      }

      let bestWaiterIndex = -1;
      let bestEventIndex = -1;
      let bestSequenceDelta = Number.POSITIVE_INFINITY;
      for (let index = 0; index < queue.length; index += 1) {
        const waiter = queue[index];
        if (!waiter) {
          continue;
        }
        const match = findCandidateMatch({
          bucket,
          minSourceEventAtMs: waiter.minSourceEventAtMs,
          deadlineAtMs: waiter.deadlineAtMs,
          expectedSequence: waiter.expectedSequence,
        });
        if (!match) {
          continue;
        }
        if (match.sequenceDeltaMs < bestSequenceDelta) {
          bestWaiterIndex = index;
          bestEventIndex = match.eventIndex;
          bestSequenceDelta = match.sequenceDeltaMs;
          continue;
        }
        if (match.sequenceDeltaMs > bestSequenceDelta) {
          continue;
        }
        const currentWaiter = queue[bestWaiterIndex];
        if (currentWaiter && waiter.startedAtMs < currentWaiter.startedAtMs) {
          bestWaiterIndex = index;
          bestEventIndex = match.eventIndex;
        }
      }
      if (bestWaiterIndex < 0 || bestEventIndex < 0) {
        return;
      }
      const waiter = queue[bestWaiterIndex];
      if (!waiter) {
        return;
      }
      const candidate = popEventAt(bindingKey, bestEventIndex);
      if (!candidate) {
        continue;
      }
      const waitedMs = Math.max(0, now - waiter.startedAtMs);
      finishWaiter({
        waiter,
        bindingKey,
        result: {
          result: "hit",
          waitedMs,
          event: {
            eventId: candidate.eventId,
            locator: candidate.locator,
            sourceEventAt: candidate.sourceEventAt,
            summary: candidate.summary,
          },
        },
      });
    }
  };

  const refreshBufferedEventExpiry = ({
    eventId,
    bindingKey,
    expiresAtMs,
  }: {
    eventId: string;
    bindingKey: string;
    expiresAtMs: number;
  }) => {
    const bucket = eventsByBindingKey.get(bindingKey);
    if (!bucket) {
      return;
    }
    const event = bucket.find((item) => item.eventId === eventId);
    if (!event) {
      return;
    }
    event.expiresAtMs = expiresAtMs;
  };

  const publish = (input: SummaryPublishRequest): SummaryBusPublishResult => {
    const now = nowMs();
    cleanup(now);

    const bindingKey = toBindingKey(input.locator);
    const locatorKey = toLocatorKey(input.locator);
    const sourceEventAtMs = safeParseDate(input.sourceEventAt, Number.NaN);
    if (!Number.isFinite(sourceEventAtMs)) {
      return {
        ok: false,
        code: "invalid_request",
        message: "sourceEventAt must be a valid date-time",
        eventId: input.eventId,
      };
    }

    const indexedByEventId = eventIdIndex.get(input.eventId);
    if (indexedByEventId) {
      if (indexedByEventId.locatorKey !== locatorKey) {
        return {
          ok: false,
          code: "invalid_request",
          message: "eventId was already used for another locator",
          eventId: input.eventId,
        };
      }
      const nextExpiresAtMs = now + bufferMs;
      eventIdIndex.set(input.eventId, {
        ...indexedByEventId,
        expiresAtMs: nextExpiresAtMs,
      });
      const indexedByLocator = locatorIndex.get(locatorKey);
      if (indexedByLocator && indexedByLocator.eventId === input.eventId) {
        locatorIndex.set(locatorKey, {
          ...indexedByLocator,
          expiresAtMs: nextExpiresAtMs,
        });
      }
      refreshBufferedEventExpiry({
        eventId: input.eventId,
        bindingKey,
        expiresAtMs: nextExpiresAtMs,
      });
      return {
        ok: true,
        eventId: input.eventId,
        deduplicated: true,
      };
    }

    const indexedByLocator = locatorIndex.get(locatorKey);
    if (indexedByLocator && indexedByLocator.eventId !== input.eventId) {
      return {
        ok: false,
        code: "invalid_request",
        message: "eventId mismatch for the same locator",
        eventId: input.eventId,
      };
    }

    if (totalEventCount >= maxEvents) {
      return {
        ok: false,
        code: "max_events_overflow",
        message: "buffer reached maxEvents",
        eventId: input.eventId,
      };
    }

    const bucket = eventsByBindingKey.get(bindingKey) ?? [];
    if (bucket.length >= maxEventsPerBinding) {
      return {
        ok: false,
        code: "max_events_overflow",
        message: "buffer reached maxEventsPerBinding",
        eventId: input.eventId,
      };
    }

    const event: BufferedEvent = {
      eventId: input.eventId,
      locator: input.locator,
      locatorKey,
      bindingKey,
      sourceEventAt: input.sourceEventAt,
      sourceEventAtMs,
      summary: input.summary,
      publishedAtMs: now,
      expiresAtMs: now + bufferMs,
    };
    bucket.push(event);
    bucket.sort(compareBufferedEvents);
    eventsByBindingKey.set(bindingKey, bucket);
    totalEventCount += 1;
    eventIdIndex.set(input.eventId, {
      bindingKey,
      locatorKey,
      expiresAtMs: now + bufferMs,
    });
    locatorIndex.set(locatorKey, {
      eventId: input.eventId,
      expiresAtMs: now + bufferMs,
    });
    wakeWaiters(bindingKey, now);

    return {
      ok: true,
      eventId: input.eventId,
      deduplicated: false,
    };
  };

  const waitForSummary = async (input: SummaryBusWaitInput): Promise<SummaryBusWaitResult> => {
    const now = nowMs();
    cleanup(now);
    const waitMs = Math.max(0, input.waitMs);
    const minSourceEventAtMs = safeParseDate(input.minSourceEventAt, now);
    const deadlineAtMs = minSourceEventAtMs + waitMs;
    const bindingKey = toBindingKey(input.binding);
    const immediateCandidate = popCandidate({
      bindingKey,
      minSourceEventAtMs,
      deadlineAtMs,
      expectedSequence: input.binding.sequence,
    });
    if (immediateCandidate) {
      return {
        result: "hit",
        waitedMs: 0,
        event: {
          eventId: immediateCandidate.eventId,
          locator: immediateCandidate.locator,
          sourceEventAt: immediateCandidate.sourceEventAt,
          summary: immediateCandidate.summary,
        },
      };
    }

    if (waitMs === 0) {
      return {
        result: "timeout",
        waitedMs: 0,
      };
    }

    if (totalWaiterCount >= maxWaiters) {
      return {
        result: "rejected",
        waitedMs: 0,
        reasonCode: "waiter_overflow",
      };
    }

    return new Promise<SummaryBusWaitResult>((resolve) => {
      const waiterId = nextWaiterId;
      nextWaiterId += 1;
      const startedAtMs = nowMs();
      const waiter: Waiter = {
        id: waiterId,
        minSourceEventAtMs,
        deadlineAtMs,
        expectedSequence: input.binding.sequence,
        startedAtMs,
        resolve,
        timer: setTimer(() => {
          const waitedMs = Math.max(0, nowMs() - startedAtMs);
          finishWaiter({
            waiter,
            bindingKey,
            result: {
              result: "timeout",
              waitedMs,
            },
          });
        }, waitMs),
      };
      const queue = waitersByBindingKey.get(bindingKey) ?? [];
      queue.push(waiter);
      waitersByBindingKey.set(bindingKey, queue);
      totalWaiterCount += 1;
      wakeWaiters(bindingKey, nowMs());
    });
  };

  return {
    publish,
    waitForSummary,
  };
};

export type SummaryBus = ReturnType<typeof createSummaryBus>;
