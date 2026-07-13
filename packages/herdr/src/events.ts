import { type Socket, createConnection } from "node:net";

import type { HerdrAgentStatusSignal } from "@vde-monitor/multiplexer";

import { HERDR_REQUEST_TIMEOUT_MS } from "./client";
import { HERDR_METHODS } from "./methods";

export type HerdrStateSignal = Omit<HerdrAgentStatusSignal, "agentStatus"> & {
  paneId: string;
  agentStatus: HerdrAgentStatusSignal["agentStatus"] | "unknown";
};

export type HerdrLifecycleEvent = {
  event: "pane_created" | "pane_closed" | "pane_exited";
  paneId: string | null;
  at: string;
};

export type HerdrEventSubscription = {
  stop: () => Promise<void>;
};

type HerdrEventMessage = {
  id?: unknown;
  result?: unknown;
  error?: {
    code?: unknown;
    message?: unknown;
  };
  event?: unknown;
  data?: {
    agent_status?: unknown;
    pane_id?: unknown;
    pane?: {
      pane_id?: unknown;
    };
  };
};

type SubscriptionState = "connecting" | "subscribing" | "active" | "stopping" | "closed";

const isHerdrAgentStatus = (value: unknown): value is HerdrStateSignal["agentStatus"] => {
  return (
    value === "working" ||
    value === "blocked" ||
    value === "done" ||
    value === "idle" ||
    value === "unknown"
  );
};

const toStateSignal = (message: HerdrEventMessage, now: () => Date): HerdrStateSignal | null => {
  if (message.event !== "pane.agent_status_changed") {
    return null;
  }
  const paneId = message.data?.pane_id;
  const agentStatus = message.data?.agent_status;
  if (typeof paneId !== "string" || !isHerdrAgentStatus(agentStatus)) {
    return null;
  }
  return {
    paneId,
    agentStatus,
    at: now().toISOString(),
  };
};

const isHerdrLifecycleEvent = (value: unknown): value is HerdrLifecycleEvent["event"] => {
  return value === "pane_created" || value === "pane_closed" || value === "pane_exited";
};

const toLifecycleEvent = (
  message: HerdrEventMessage,
  now: () => Date,
): HerdrLifecycleEvent | null => {
  if (!isHerdrLifecycleEvent(message.event)) {
    return null;
  }
  const paneId =
    message.event === "pane_created" ? message.data?.pane?.pane_id : message.data?.pane_id;
  return {
    event: message.event,
    paneId: typeof paneId === "string" ? paneId : null,
    at: now().toISOString(),
  };
};

const parseMessage = (line: string): HerdrEventMessage | null => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
  return parsed as HerdrEventMessage;
};

const createSocketClosedError = (cause?: Error): Error =>
  new Error("herdr event socket closed", cause == null ? undefined : { cause });

const normalizeSocketError = (error: Error): Error => {
  const code = (error as NodeJS.ErrnoException).code;
  if (
    code === "EPIPE" ||
    code === "ECONNRESET" ||
    code === "ECONNABORTED" ||
    code === "ERR_STREAM_DESTROYED"
  ) {
    return createSocketClosedError(error);
  }
  return new Error(`herdr event socket error: ${error.message}`, { cause: error });
};

const createTimeoutError = (stage: "connection" | "subscription", timeoutMs: number): Error =>
  new Error(`herdr event ${stage} timed out after ${timeoutMs}ms`);

export const subscribeHerdrEvents = async ({
  socketPath,
  paneIds = [],
  onSignal,
  onLifecycleEvent,
  onDisconnect,
  now = () => new Date(),
  timeoutMs = HERDR_REQUEST_TIMEOUT_MS,
}: {
  socketPath: string;
  paneIds?: string[];
  onSignal: (signal: HerdrStateSignal) => void;
  onLifecycleEvent?: (event: HerdrLifecycleEvent) => void;
  onDisconnect?: (error: Error) => void;
  now?: () => Date;
  timeoutMs?: number;
}): Promise<HerdrEventSubscription> => {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    throw new Error("herdr event timeout must be a positive integer");
  }

  const socket = createConnection(socketPath);
  socket.setEncoding("utf8");

  let state: SubscriptionState = "connecting";
  let buffer = "";
  let failureError: Error | null = null;
  let stageTimer: ReturnType<typeof setTimeout> | null = null;
  let rejectStage: ((error: Error) => void) | null = null;
  let resolveSubscription: (() => void) | null = null;

  const clearStage = (): void => {
    if (stageTimer != null) clearTimeout(stageTimer);
    stageTimer = null;
    rejectStage = null;
  };
  const notifyDisconnect = (error: Error): void => {
    Promise.resolve()
      .then(() => onDisconnect?.(error))
      .catch(() => undefined);
  };
  const fail = (error: Error): void => {
    if (state === "closed" || state === "stopping") return;
    const wasActive = state === "active";
    failureError = error;
    state = "closed";
    const reject = rejectStage;
    clearStage();
    reject?.(error);
    socket.destroy();
    if (wasActive) notifyDisconnect(error);
  };

  socket.on("error", (error) => fail(normalizeSocketError(error)));
  socket.on("end", () => fail(createSocketClosedError()));
  socket.on("close", () => fail(createSocketClosedError()));

  const subscriptionId = "sub_1";
  socket.on("data", (chunk: string) => {
    buffer += chunk;
    let newlineIndex = buffer.indexOf("\n");
    while (newlineIndex >= 0) {
      const line = buffer.slice(0, newlineIndex);
      buffer = buffer.slice(newlineIndex + 1);
      if (line.trim().length > 0) {
        const message = parseMessage(line);
        if (message == null) {
          fail(new Error("herdr event socket returned invalid JSON"));
          return;
        }
        if (String(message.id) === subscriptionId) {
          if (message.error != null) {
            const code = typeof message.error.code === "string" ? ` ${message.error.code}` : "";
            const detail =
              typeof message.error.message === "string" ? `: ${message.error.message}` : "";
            fail(new Error(`herdr events.subscribe failed${code}${detail}`));
            return;
          }
          if (
            typeof message.result !== "object" ||
            message.result == null ||
            Array.isArray(message.result) ||
            (message.result as { type?: unknown }).type !== "subscription_started"
          ) {
            fail(new Error("herdr events.subscribe returned an invalid acknowledgement"));
            return;
          }
          if (state === "subscribing") {
            state = "active";
            const resolve = resolveSubscription;
            clearStage();
            resolve?.();
          }
        } else {
          const signal = toStateSignal(message, now);
          if (signal != null) {
            onSignal(signal);
          } else {
            const lifecycleEvent = toLifecycleEvent(message, now);
            if (lifecycleEvent != null) onLifecycleEvent?.(lifecycleEvent);
          }
        }
      }
      newlineIndex = buffer.indexOf("\n");
    }
  });

  await new Promise<void>((resolve, reject) => {
    rejectStage = reject;
    stageTimer = setTimeout(() => fail(createTimeoutError("connection", timeoutMs)), timeoutMs);
    socket.once("connect", () => {
      if (state !== "connecting") return;
      state = "subscribing";
      clearStage();
      resolve();
    });
  });

  const request = {
    id: subscriptionId,
    method: HERDR_METHODS.eventsSubscribe,
    params: {
      subscriptions: [
        ...paneIds.map((paneId) => ({
          type: "pane.agent_status_changed",
          pane_id: paneId,
        })),
        { type: "pane.created" },
        { type: "pane.closed" },
        { type: "pane.exited" },
      ],
    },
  };

  await new Promise<void>((resolve, reject) => {
    resolveSubscription = resolve;
    rejectStage = reject;
    if (state !== "subscribing") {
      clearStage();
      reject(failureError ?? createSocketClosedError());
      return;
    }
    stageTimer = setTimeout(() => fail(createTimeoutError("subscription", timeoutMs)), timeoutMs);
    socket.write(`${JSON.stringify(request)}\n`, (error) => {
      if (error != null) fail(normalizeSocketError(error));
    });
  });

  return {
    stop: async () => {
      if (state === "closed" || state === "stopping") return;
      state = "stopping";
      clearStage();
      await closeSocket(socket);
      state = "closed";
    },
  };
};

const closeSocket = async (socket: Socket): Promise<void> => {
  if (socket.destroyed || socket.closed) return;
  await new Promise<void>((resolve) => {
    socket.once("close", resolve);
    socket.destroy();
  });
};
