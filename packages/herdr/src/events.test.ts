import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";

import { HERDR_METHODS } from "./methods";
import { subscribeHerdrEvents } from "./events";

const tempDirs: string[] = [];

const makeTempSocketPath = async (): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), "vde-herdr-events-"));
  tempDirs.push(dir);
  return join(dir, "herdr.sock");
};

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("subscribeHerdrEvents", () => {
  it("subscribes to pane agent status changes and emits state signals", async () => {
    const socketPath = await makeTempSocketPath();
    const requests: unknown[] = [];
    const signals: unknown[] = [];
    const lifecycleEvents: unknown[] = [];
    let push: ((line: unknown) => void) | null = null;

    const server = createServer((socket) => {
      socket.setEncoding("utf8");
      push = (line) => socket.write(`${JSON.stringify(line)}\n`);
      let buffer = "";
      socket.on("data", (chunk: string) => {
        buffer += chunk;
        let newlineIndex = buffer.indexOf("\n");
        while (newlineIndex >= 0) {
          const line = buffer.slice(0, newlineIndex);
          buffer = buffer.slice(newlineIndex + 1);
          const request = JSON.parse(line) as { id: string; method: string; params: unknown };
          requests.push(request);
          socket.write(
            `${JSON.stringify({ id: request.id, result: { type: "subscription_started" } })}\n`,
          );
          newlineIndex = buffer.indexOf("\n");
        }
      });
    });

    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(socketPath, resolve);
    });

    const subscription = await subscribeHerdrEvents({
      socketPath,
      paneIds: ["wB:p1"],
      onSignal: (signal) => signals.push(signal),
      onLifecycleEvent: (event) => lifecycleEvents.push(event),
      now: () => new Date("2026-07-02T00:00:00.000Z"),
    });
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(requests).toEqual([
      {
        id: "sub_1",
        method: HERDR_METHODS.eventsSubscribe,
        params: {
          subscriptions: [
            { type: "pane.agent_status_changed", pane_id: "wB:p1" },
            { type: "pane.created" },
            { type: "pane.closed" },
            { type: "pane.exited" },
          ],
        },
      },
    ]);

    const emit = (line: unknown) => {
      if (push == null) {
        throw new Error("socket not connected");
      }
      push(line);
    };

    emit({
      data: {
        agent: "phase0-agent",
        agent_status: "blocked",
        pane_id: "wB:p1",
        workspace_id: "wB",
      },
      event: "pane.agent_status_changed",
    });
    emit({
      data: {
        agent_status: "unknown",
        pane_id: "wB:p1",
        workspace_id: "wB",
      },
      event: "pane.agent_status_changed",
    });
    emit({
      data: {
        type: "pane_created",
        pane: {
          pane_id: "wB:p2",
          workspace_id: "wB",
        },
      },
      event: "pane_created",
    });

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(signals).toEqual([
      {
        paneId: "wB:p1",
        agentStatus: "blocked",
        at: "2026-07-02T00:00:00.000Z",
      },
      {
        paneId: "wB:p1",
        agentStatus: "unknown",
        at: "2026-07-02T00:00:00.000Z",
      },
    ]);
    expect(lifecycleEvents).toEqual([
      {
        event: "pane_created",
        paneId: "wB:p2",
        at: "2026-07-02T00:00:00.000Z",
      },
    ]);

    await subscription.stop();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });

  it("omits pane status subscriptions when there are no panes", async () => {
    const socketPath = await makeTempSocketPath();
    let receivedSubscriptions: unknown[] | null = null;
    const server = createServer((socket) => {
      socket.once("data", (chunk) => {
        const request = JSON.parse(chunk.toString().trim()) as {
          id: string;
          params: { subscriptions: unknown[] };
        };
        receivedSubscriptions = request.params.subscriptions;
        socket.write(
          `${JSON.stringify({ id: request.id, result: { type: "subscription_started" } })}\n`,
        );
      });
    });

    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(socketPath, resolve);
    });

    const subscription = await subscribeHerdrEvents({
      socketPath,
      paneIds: [],
      onSignal: () => undefined,
    });

    expect(receivedSubscriptions).toEqual([
      { type: "pane.created" },
      { type: "pane.closed" },
      { type: "pane.exited" },
    ]);

    await subscription.stop();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });

  it("does not resolve until events.subscribe is acknowledged", async () => {
    const socketPath = await makeTempSocketPath();
    let acknowledge = (): void => {
      throw new Error("subscription request not received");
    };
    let markReceived: (() => void) | null = null;
    const received = new Promise<void>((resolve) => {
      markReceived = resolve;
    });
    const server = createServer((socket) => {
      socket.once("data", (chunk) => {
        const request = JSON.parse(chunk.toString().trim()) as { id: string };
        acknowledge = () =>
          socket.write(
            `${JSON.stringify({ id: request.id, result: { type: "subscription_started" } })}\n`,
          );
        markReceived?.();
      });
    });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(socketPath, resolve);
    });

    let settled = false;
    const pending = subscribeHerdrEvents({ socketPath, onSignal: () => undefined }).finally(() => {
      settled = true;
    });
    await received;
    expect(settled).toBe(false);
    acknowledge();

    const subscription = await pending;
    await subscription.stop();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });

  it("rejects an events.subscribe error response", async () => {
    const socketPath = await makeTempSocketPath();
    const server = createServer((socket) => {
      socket.once("data", (chunk) => {
        const request = JSON.parse(chunk.toString().trim()) as { id: string };
        socket.write(
          `${JSON.stringify({ id: request.id, error: { code: "unsupported", message: "no" } })}\n`,
        );
      });
    });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(socketPath, resolve);
    });

    await expect(subscribeHerdrEvents({ socketPath, onSignal: () => undefined })).rejects.toThrow(
      "events.subscribe failed unsupported: no",
    );
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });

  it("rejects an events.subscribe acknowledgement with an incompatible result", async () => {
    const socketPath = await makeTempSocketPath();
    const server = createServer((socket) => {
      socket.once("data", (chunk) => {
        const request = JSON.parse(chunk.toString().trim()) as { id: string };
        socket.write(`${JSON.stringify({ id: request.id, result: {} })}\n`);
      });
    });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(socketPath, resolve);
    });

    await expect(subscribeHerdrEvents({ socketPath, onSignal: () => undefined })).rejects.toThrow(
      "invalid acknowledgement",
    );
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });

  it("times out when events.subscribe is not acknowledged", async () => {
    const socketPath = await makeTempSocketPath();
    const server = createServer((socket) => socket.resume());
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(socketPath, resolve);
    });

    await expect(
      subscribeHerdrEvents({ socketPath, onSignal: () => undefined, timeoutMs: 20 }),
    ).rejects.toThrow("subscription timed out after 20ms");
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });

  it("rejects when the socket closes between connect and subscribe setup", async () => {
    const socketPath = await makeTempSocketPath();
    const server = createServer((socket) => socket.destroy());
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(socketPath, resolve);
    });

    await expect(
      subscribeHerdrEvents({ socketPath, onSignal: () => undefined, timeoutMs: 100 }),
    ).rejects.toThrow("event socket closed");
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });

  it("notifies one recoverable disconnect for invalid JSON after subscribing", async () => {
    const socketPath = await makeTempSocketPath();
    let pushInvalidJson = (): void => {
      throw new Error("subscription request not received");
    };
    const server = createServer((socket) => {
      socket.once("data", (chunk) => {
        const request = JSON.parse(chunk.toString().trim()) as { id: string };
        socket.write(
          `${JSON.stringify({ id: request.id, result: { type: "subscription_started" } })}\n`,
        );
        pushInvalidJson = () => socket.write("{not-json}\n");
      });
    });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(socketPath, resolve);
    });
    let resolveDisconnected: ((error: Error) => void) | null = null;
    const disconnected = new Promise<Error>((resolve) => {
      resolveDisconnected = resolve;
    });
    const onDisconnect = vi.fn((error: Error) => resolveDisconnected?.(error));

    const subscription = await subscribeHerdrEvents({
      socketPath,
      onSignal: () => undefined,
      onDisconnect,
    });
    pushInvalidJson();

    expect((await disconnected).message).toContain("invalid JSON");
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(onDisconnect).toHaveBeenCalledTimes(1);
    await subscription.stop();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });

  it("does not notify a disconnect when explicitly stopped", async () => {
    const socketPath = await makeTempSocketPath();
    const server = createServer((socket) => {
      socket.once("data", (chunk) => {
        const request = JSON.parse(chunk.toString().trim()) as { id: string };
        socket.write(
          `${JSON.stringify({ id: request.id, result: { type: "subscription_started" } })}\n`,
        );
      });
    });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(socketPath, resolve);
    });
    const onDisconnect = vi.fn();

    const subscription = await subscribeHerdrEvents({
      socketPath,
      onSignal: () => undefined,
      onDisconnect,
    });
    await subscription.stop();
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(onDisconnect).not.toHaveBeenCalled();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });
});
