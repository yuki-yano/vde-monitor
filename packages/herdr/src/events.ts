import { type Socket, createConnection } from "node:net";

import type { HerdrAgentStatusSignal } from "@vde-monitor/multiplexer";

import { HERDR_METHODS } from "./methods";

export type HerdrStateSignal = HerdrAgentStatusSignal & {
  paneId: string;
};

export type HerdrLifecycleEvent = {
  event: "pane.created" | "pane.closed" | "pane.exited";
  paneId: string | null;
  at: string;
};

export type HerdrEventSubscription = {
  stop: () => Promise<void>;
};

type HerdrEventMessage = {
  event?: string;
  data?: {
    agent_status?: unknown;
    pane_id?: unknown;
  };
};

const isHerdrAgentStatus = (value: unknown): value is HerdrAgentStatusSignal["agentStatus"] => {
  return value === "working" || value === "blocked" || value === "done" || value === "idle";
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
  return value === "pane.created" || value === "pane.closed" || value === "pane.exited";
};

const toLifecycleEvent = (
  message: HerdrEventMessage,
  now: () => Date,
): HerdrLifecycleEvent | null => {
  if (!isHerdrLifecycleEvent(message.event)) {
    return null;
  }
  const paneId = message.data?.pane_id;
  return {
    event: message.event,
    paneId: typeof paneId === "string" ? paneId : null,
    at: now().toISOString(),
  };
};

export const subscribeHerdrEvents = async ({
  socketPath,
  paneIds = [],
  onSignal,
  onLifecycleEvent,
  now = () => new Date(),
}: {
  socketPath: string;
  paneIds?: string[];
  onSignal: (signal: HerdrStateSignal) => void;
  onLifecycleEvent?: (event: HerdrLifecycleEvent) => void;
  now?: () => Date;
}): Promise<HerdrEventSubscription> => {
  const socket = createConnection(socketPath);
  socket.setEncoding("utf8");

  let buffer = "";
  socket.on("data", (chunk: string) => {
    buffer += chunk;
    let newlineIndex = buffer.indexOf("\n");
    while (newlineIndex >= 0) {
      const line = buffer.slice(0, newlineIndex);
      buffer = buffer.slice(newlineIndex + 1);
      if (line.trim()) {
        const message = JSON.parse(line) as HerdrEventMessage;
        const signal = toStateSignal(message, now);
        if (signal != null) {
          onSignal(signal);
        } else {
          const lifecycleEvent = toLifecycleEvent(message, now);
          if (lifecycleEvent != null) {
            onLifecycleEvent?.(lifecycleEvent);
          }
        }
      }
      newlineIndex = buffer.indexOf("\n");
    }
  });

  await new Promise<void>((resolve, reject) => {
    const cleanup = (): void => {
      socket.off("connect", onConnect);
      socket.off("error", onError);
    };
    const onConnect = (): void => {
      cleanup();
      resolve();
    };
    const onError = (error: Error): void => {
      cleanup();
      reject(error);
    };
    socket.once("connect", onConnect);
    socket.once("error", onError);
  });

  const request = {
    id: "sub_1",
    method: HERDR_METHODS.eventsSubscribe,
    params: {
      subscriptions: [
        ...(paneIds.length === 0
          ? [{ type: "pane.agent_status_changed" }]
          : paneIds.map((paneId) => ({
              type: "pane.agent_status_changed",
              pane_id: paneId,
            }))),
        { type: "pane.created" },
        { type: "pane.closed" },
        { type: "pane.exited" },
      ],
    },
  };
  await new Promise<void>((resolve, reject) => {
    socket.write(`${JSON.stringify(request)}\n`, (error) => {
      if (error == null) {
        resolve();
        return;
      }
      reject(error);
    });
  });

  return {
    stop: () => closeSocket(socket),
  };
};

const closeSocket = async (socket: Socket): Promise<void> => {
  if (socket.destroyed || socket.closed) {
    return;
  }
  await new Promise<void>((resolve) => {
    socket.once("close", resolve);
    socket.end();
  });
};
