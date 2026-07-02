import type { SessionsStreamEvent } from "@vde-monitor/shared";

import { nowIso } from "../utils/time";
import type { createSessionRegistry } from "../session-registry";

type Registry = ReturnType<typeof createSessionRegistry>;
type SourceEntry = { id: number; event: SessionsStreamEvent };
type Listener = (entry: SourceEntry) => void;

const RING_BUFFER_LIMIT = 1000;

export const createSessionsStreamSource = ({ registry }: { registry: Registry }) => {
  // nextId starts at 1; each pushed event gets nextId then increments.
  // The "last processed id" before any events is 0.
  let nextId = 1;
  const buffer: SourceEntry[] = [];
  const listeners = new Set<Listener>();

  const push = (event: SessionsStreamEvent): number => {
    const id = nextId++;
    const entry: SourceEntry = { id, event };
    buffer.push(entry);
    if (buffer.length > RING_BUFFER_LIMIT) {
      buffer.shift();
    }
    listeners.forEach((listener) => listener(entry));
    return id;
  };

  const unsubscribeChanged = registry.onChanged((session) => {
    push({ type: "upsert", serverTime: nowIso(), session });
  });

  const unsubscribeRemoved = registry.onRemoved((paneId) => {
    push({ type: "remove", serverTime: nowIso(), paneId });
  });

  /**
   * Subscribe to future events. Returns an unsubscribe function.
   */
  const subscribe = (listener: Listener): (() => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };

  /**
   * Build a snapshot entry representing the current full state of the registry.
   * The `id` is the last buffered event id (or 0 if no events have been pushed),
   * so clients can use it as Last-Event-ID for future replay connections.
   */
  const snapshot = (): SourceEntry => {
    const id = buffer.length > 0 ? (buffer[buffer.length - 1]?.id ?? 0) : 0;
    return {
      id,
      event: {
        type: "snapshot",
        serverTime: nowIso(),
        sessions: registry.snapshot(),
      },
    };
  };

  /**
   * Return buffered events with id > lastEventId.
   * Returns null when lastEventId is older than the oldest entry in the buffer
   * (i.e., the buffer cannot cover a replay from that point).
   */
  const replaySince = (lastEventId: number): SourceEntry[] | null => {
    if (buffer.length === 0) {
      return [];
    }
    const oldestId = buffer[0]?.id ?? 1;
    // We can replay if lastEventId >= oldestId - 1.
    // (oldestId - 1 means "just before the oldest buffered event".)
    if (lastEventId < oldestId - 1) {
      return null;
    }
    return buffer.filter((entry) => entry.id > lastEventId);
  };

  const dispose = (): void => {
    unsubscribeChanged();
    unsubscribeRemoved();
    listeners.clear();
  };

  return { subscribe, snapshot, replaySince, dispose };
};

export type SessionsStreamSource = ReturnType<typeof createSessionsStreamSource>;
