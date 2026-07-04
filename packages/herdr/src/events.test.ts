import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import { afterEach, describe, expect, it } from "vitest";

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
        pane_id: "wB:p2",
        workspace_id: "wB",
      },
      event: "pane.created",
    });

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(signals).toEqual([
      {
        paneId: "wB:p1",
        agentStatus: "blocked",
        at: "2026-07-02T00:00:00.000Z",
      },
    ]);
    expect(lifecycleEvents).toEqual([
      {
        event: "pane.created",
        paneId: "wB:p2",
        at: "2026-07-02T00:00:00.000Z",
      },
    ]);

    await subscription.stop();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });
});
