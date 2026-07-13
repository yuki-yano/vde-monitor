import { Hono } from "hono";
import { streamSSE } from "hono/streaming";

import type { ScreenStreamScheduler } from "../../../streams/screen-stream-scheduler";
import type { SessionsStreamSource } from "../../../streams/sessions-stream-source";
import type { StreamConnections } from "../../../streams/stream-connections";
import { buildError } from "../../helpers";
import type { Monitor } from "../types";

const HEARTBEAT_INTERVAL_MS = 15_000;
const SESSIONS_QUEUE_DATA_LIMIT = 100;
const SCREEN_QUEUE_DATA_LIMIT = 8;

type SseQueueItem = { id?: string; event: string; data: string };

export const createBoundedSseQueue = <Item extends SseQueueItem>({
  maxDataItems,
  onDataOverflow,
}: {
  maxDataItems: number;
  onDataOverflow?: () => Item;
}) => {
  const items: Item[] = [];

  const enqueue = (item: Item): boolean => {
    if (item.event === "heartbeat") {
      if (items.some((queued) => queued.event === "heartbeat")) {
        return true;
      }
      items.push(item);
      return true;
    }
    const dataItemCount = items.filter((queued) => queued.event !== "heartbeat").length;
    if (dataItemCount >= maxDataItems) {
      if (onDataOverflow == null) {
        return false;
      }
      const heartbeats = items.filter((queued) => queued.event === "heartbeat");
      items.splice(0, items.length, ...heartbeats, onDataOverflow());
      return true;
    }
    items.push(item);
    return true;
  };

  const shift = () => items.shift();
  const hasItems = () => items.length > 0;

  return { enqueue, shift, hasItems };
};

type StreamRouteDeps = {
  monitor: Monitor;
  streamSource: SessionsStreamSource;
  screenScheduler: ScreenStreamScheduler;
  streamConnections: StreamConnections;
};

type RouteSseStream = {
  writeSSE: (item: SseQueueItem) => Promise<void>;
  onAbort: (listener: () => void) => void;
  abort: () => void;
};

export const runScreenSseSession = async ({
  paneId,
  stream,
  screenScheduler,
  streamConnections,
}: {
  paneId: string;
  stream: RouteSseStream;
  screenScheduler: ScreenStreamScheduler;
  streamConnections: StreamConnections;
}): Promise<void> => {
  const queue = createBoundedSseQueue<SseQueueItem>({
    maxDataItems: SCREEN_QUEUE_DATA_LIMIT,
  });
  let wakeUp: (() => void) | null = null;
  let closed = false;
  let cleanedUp = false;
  let unsubscribe: (() => void) | null = null;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  const wakeLoop = (): void => {
    if (!wakeUp) return;
    const resolve = wakeUp;
    wakeUp = null;
    resolve();
  };
  const cleanup = ({ abortStream = false }: { abortStream?: boolean } = {}): void => {
    if (cleanedUp) return;
    cleanedUp = true;
    closed = true;
    if (heartbeatTimer != null) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
    const stopSubscription = unsubscribe;
    unsubscribe = null;
    stopSubscription?.();
    if (abortStream) {
      stream.abort();
    }
  };
  const enqueue = (item: SseQueueItem): void => {
    if (closed) return;
    if (!queue.enqueue(item)) {
      cleanup({ abortStream: true });
    }
    wakeLoop();
  };

  const registeredUnsubscribe = screenScheduler.subscribe(paneId, (response) => {
    enqueue({ event: "screen", data: JSON.stringify(response) });
  });
  if (cleanedUp) {
    registeredUnsubscribe();
    return;
  }
  unsubscribe = registeredUnsubscribe;

  heartbeatTimer = setInterval(() => {
    enqueue({ event: "heartbeat", data: "{}" });
  }, HEARTBEAT_INTERVAL_MS);

  const removeConnection = streamConnections.add(() => {
    cleanup({ abortStream: true });
    wakeLoop();
  });
  stream.onAbort(() => {
    cleanup();
    wakeLoop();
  });

  try {
    while (!closed) {
      while (!closed && queue.hasItems()) {
        const item = queue.shift()!;
        await stream.writeSSE(item);
      }
      if (!closed) {
        await new Promise<void>((resolve) => {
          wakeUp = resolve;
        });
      }
    }
  } catch {
    // Stream write failure means the client disconnected.
  } finally {
    cleanup();
    removeConnection();
  }
};

const parseLastEventId = (raw: string | undefined): number | null => {
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : null;
};

export const runSessionsSseSession = async ({
  lastEventId,
  stream,
  streamSource,
  streamConnections,
}: {
  lastEventId: number | null;
  stream: RouteSseStream;
  streamSource: SessionsStreamSource;
  streamConnections: StreamConnections;
}): Promise<void> => {
  const queue = createBoundedSseQueue<SseQueueItem>({
    maxDataItems: SESSIONS_QUEUE_DATA_LIMIT,
    onDataOverflow: () => {
      const { id, event } = streamSource.snapshot();
      return { id: String(id), event: "sessions", data: JSON.stringify(event) };
    },
  });
  let wakeUp: (() => void) | null = null;
  let closed = false;

  const wakeLoop = (): void => {
    if (!wakeUp) return;
    const resolve = wakeUp;
    wakeUp = null;
    resolve();
  };
  const enqueue = (item: SseQueueItem): void => {
    if (closed) return;
    queue.enqueue(item);
    wakeLoop();
  };

  let useSnapshot = true;
  if (lastEventId !== null) {
    const replay = streamSource.replaySince(lastEventId);
    if (replay !== null && replay.length <= SESSIONS_QUEUE_DATA_LIMIT) {
      useSnapshot = false;
      for (const entry of replay) {
        enqueue({
          id: String(entry.id),
          event: "sessions",
          data: JSON.stringify(entry.event),
        });
      }
    }
  }

  if (useSnapshot) {
    const { id, event } = streamSource.snapshot();
    enqueue({ id: String(id), event: "sessions", data: JSON.stringify(event) });
  }

  const unsubscribe = streamSource.subscribe((entry) => {
    enqueue({ id: String(entry.id), event: "sessions", data: JSON.stringify(entry.event) });
  });
  const heartbeatTimer = setInterval(() => {
    enqueue({ event: "heartbeat", data: "{}" });
  }, HEARTBEAT_INTERVAL_MS);

  const cleanup = ({ abortStream = false }: { abortStream?: boolean } = {}): void => {
    if (closed) return;
    closed = true;
    clearInterval(heartbeatTimer);
    unsubscribe();
    if (abortStream) {
      stream.abort();
    }
  };

  const removeConnection = streamConnections.add(() => {
    cleanup({ abortStream: true });
    wakeLoop();
  });
  stream.onAbort(() => {
    cleanup();
    wakeLoop();
  });

  try {
    while (!closed) {
      while (!closed && queue.hasItems()) {
        const item = queue.shift()!;
        await stream.writeSSE(item);
      }
      if (!closed) {
        await new Promise<void>((resolve) => {
          wakeUp = resolve;
        });
      }
    }
  } catch {
    // Stream write failure means the client disconnected.
  } finally {
    cleanup();
    removeConnection();
  }
};

export const createStreamRoutes = ({
  monitor,
  streamSource,
  screenScheduler,
  streamConnections,
}: StreamRouteDeps) => {
  return (
    new Hono()
      // -----------------------------------------------------------------------
      // GET /streams/sessions
      // -----------------------------------------------------------------------
      .get("/streams/sessions", (c) => {
        return streamSSE(c, async (stream) => {
          // streamSSE internally sets Cache-Control: no-cache before invoking this callback.
          // We override here (after that internal assignment) to add no-transform.
          c.header("Cache-Control", "no-cache, no-transform");
          c.header("X-Accel-Buffering", "no");

          const rawLastEventId = c.req.header("Last-Event-ID") ?? c.req.header("last-event-id");
          const lastEventId = parseLastEventId(rawLastEventId);
          await runSessionsSseSession({
            lastEventId,
            stream,
            streamSource,
            streamConnections,
          });
        });
      })

      // -----------------------------------------------------------------------
      // GET /streams/sessions/:paneId/screen
      // -----------------------------------------------------------------------
      .get("/streams/sessions/:paneId/screen", (c) => {
        const paneId = c.req.param("paneId");
        if (!paneId) {
          return c.json({ error: buildError("INVALID_PAYLOAD", "invalid pane id") }, 400);
        }
        const detail = monitor.registry.getDetail(paneId);
        if (!detail) {
          return c.json({ error: buildError("INVALID_PANE", "pane not found") }, 404);
        }

        return streamSSE(c, async (stream) => {
          // streamSSE internally sets Cache-Control: no-cache before invoking this callback.
          // We override here (after that internal assignment) to add no-transform.
          c.header("Cache-Control", "no-cache, no-transform");
          c.header("X-Accel-Buffering", "no");

          await runScreenSseSession({ paneId, stream, screenScheduler, streamConnections });
        });
      })
  );
};
