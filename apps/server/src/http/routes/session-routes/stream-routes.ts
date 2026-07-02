import { Hono } from "hono";
import { streamSSE } from "hono/streaming";

import type { ScreenStreamScheduler } from "../../../streams/screen-stream-scheduler";
import type { SessionsStreamSource } from "../../../streams/sessions-stream-source";
import type { StreamConnections } from "../../../streams/stream-connections";
import { buildError } from "../../helpers";
import type { Monitor } from "../types";

const HEARTBEAT_INTERVAL_MS = 15_000;

type StreamRouteDeps = {
  monitor: Monitor;
  streamSource: SessionsStreamSource;
  screenScheduler: ScreenStreamScheduler;
  streamConnections: StreamConnections;
};

const parseLastEventId = (raw: string | undefined): number | null => {
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : null;
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

          type QueueItem = { id?: string; event: string; data: string };
          const queue: QueueItem[] = [];
          let wakeUp: (() => void) | null = null;
          let closed = false;

          const enqueue = (item: QueueItem): void => {
            if (closed) return;
            queue.push(item);
            if (wakeUp) {
              const resolve = wakeUp;
              wakeUp = null;
              resolve();
            }
          };

          // Replay or snapshot ------------------------------------------------
          const rawLastEventId = c.req.header("Last-Event-ID") ?? c.req.header("last-event-id");
          const lastEventId = parseLastEventId(rawLastEventId);

          let useSnapshot = true;
          if (lastEventId !== null) {
            const replay = streamSource.replaySince(lastEventId);
            if (replay !== null) {
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

          // Subscribe to future events ----------------------------------------
          const unsubscribe = streamSource.subscribe((entry) => {
            enqueue({ id: String(entry.id), event: "sessions", data: JSON.stringify(entry.event) });
          });

          // Heartbeat ---------------------------------------------------------
          const heartbeatTimer = setInterval(() => {
            enqueue({ event: "heartbeat", data: "{}" });
          }, HEARTBEAT_INTERVAL_MS);

          const cleanup = (): void => {
            if (closed) return;
            closed = true;
            clearInterval(heartbeatTimer);
            unsubscribe();
          };

          const removeConnection = streamConnections.add(() => {
            cleanup();
            // Wake the loop so it can observe `closed` and exit.
            if (wakeUp) {
              const resolve = wakeUp;
              wakeUp = null;
              resolve();
            }
          });

          stream.onAbort(() => {
            cleanup();
            if (wakeUp) {
              const resolve = wakeUp;
              wakeUp = null;
              resolve();
            }
          });

          try {
            while (!closed) {
              while (queue.length > 0) {
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

          type QueueItem = { event: string; data: string };
          const queue: QueueItem[] = [];
          let wakeUp: (() => void) | null = null;
          let closed = false;

          const enqueue = (item: QueueItem): void => {
            if (closed) return;
            queue.push(item);
            if (wakeUp) {
              const resolve = wakeUp;
              wakeUp = null;
              resolve();
            }
          };

          // Subscribe: immediate snapshot + future deltas --------------------
          const unsubscribe = screenScheduler.subscribe(paneId, (response) => {
            enqueue({ event: "screen", data: JSON.stringify(response) });
          });

          // Heartbeat ---------------------------------------------------------
          const heartbeatTimer = setInterval(() => {
            enqueue({ event: "heartbeat", data: "{}" });
          }, HEARTBEAT_INTERVAL_MS);

          const cleanup = (): void => {
            if (closed) return;
            closed = true;
            clearInterval(heartbeatTimer);
            unsubscribe();
          };

          const removeConnection = streamConnections.add(() => {
            cleanup();
            if (wakeUp) {
              const resolve = wakeUp;
              wakeUp = null;
              resolve();
            }
          });

          stream.onAbort(() => {
            cleanup();
            if (wakeUp) {
              const resolve = wakeUp;
              wakeUp = null;
              resolve();
            }
          });

          try {
            while (!closed) {
              while (queue.length > 0) {
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
        });
      })
  );
};
