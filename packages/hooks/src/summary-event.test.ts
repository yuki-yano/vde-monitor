import os from "node:os";
import path from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  readFileSync: vi.fn(),
  spawnSync: vi.fn(),
  loadConfig: vi.fn(),
  resolveHookServerKey: vi.fn(),
}));

vi.mock("node:fs", () => ({
  default: {
    readFileSync: mocks.readFileSync,
  },
  readFileSync: mocks.readFileSync,
}));

vi.mock("node:child_process", () => ({
  default: {
    spawnSync: mocks.spawnSync,
  },
  spawnSync: mocks.spawnSync,
}));

vi.mock("./cli", () => ({
  loadConfig: mocks.loadConfig,
  resolveHookServerKey: mocks.resolveHookServerKey,
}));

import {
  appendSummaryEvent,
  resolveSummaryPublishEndpointFromConnectionInfo,
} from "./summary-event";

describe("resolveSummaryPublishEndpointFromConnectionInfo", () => {
  it("accepts loopback listener endpoint", () => {
    const endpoint = resolveSummaryPublishEndpointFromConnectionInfo({
      schemaVersion: 1,
      endpoint: "http://127.0.0.1:11080/api/notifications/summary-events",
      listenerType: "loopback",
      bind: "127.0.0.1",
      tokenRef: "server-token",
    });

    expect(endpoint).toBe("http://127.0.0.1:11080/api/notifications/summary-events");
  });

  it("accepts network listener endpoint when host matches bind", () => {
    const endpoint = resolveSummaryPublishEndpointFromConnectionInfo({
      schemaVersion: 1,
      endpoint: "http://100.64.0.10:11080/api/notifications/summary-events",
      listenerType: "network",
      bind: "100.64.0.10",
      tokenRef: "server-token",
    });

    expect(endpoint).toBe("http://100.64.0.10:11080/api/notifications/summary-events");
  });

  it("rejects network listener endpoint when host does not match bind", () => {
    const endpoint = resolveSummaryPublishEndpointFromConnectionInfo({
      schemaVersion: 1,
      endpoint: "http://100.64.0.10:11080/api/notifications/summary-events",
      listenerType: "network",
      bind: "100.64.0.11",
      tokenRef: "server-token",
    });

    expect(endpoint).toBeNull();
  });
});

describe("appendSummaryEvent", () => {
  const tokenPath = path.join(os.homedir(), ".vde-monitor", "token.json");
  const connectionInfoPath = path.join(
    os.homedir(),
    ".vde-monitor",
    "events",
    "default",
    "summary-connection.json",
  );

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadConfig.mockReturnValue(null);
    mocks.resolveHookServerKey.mockReturnValue("default");
    mocks.readFileSync.mockImplementation((filePath: string) => {
      if (filePath === tokenPath) {
        return JSON.stringify({ token: "test-token" });
      }
      if (filePath === connectionInfoPath) {
        return JSON.stringify({
          schemaVersion: 1,
          endpoint: "http://127.0.0.1:11080/api/notifications/summary-events",
          listenerType: "loopback",
          bind: "127.0.0.1",
          tokenRef: "server-token",
        });
      }
      throw new Error(`unexpected read: ${filePath}`);
    });
    mocks.spawnSync.mockReturnValue({
      status: 0,
      stdout: "202",
    });
  });

  it("passes curl headers via stdin pipe", () => {
    appendSummaryEvent({
      schemaVersion: 1,
      eventId: "event-1",
      locator: {
        source: "codex",
        runId: "%14",
        paneId: "%14",
        eventType: "pane.task_completed",
        sequence: 1,
      },
      sourceEventAt: "2026-03-12T00:00:00.000Z",
      summary: {
        paneTitle: "pane",
        notificationTitle: "title",
        notificationBody: "body",
      },
    });

    expect(mocks.spawnSync).toHaveBeenCalledWith(
      "curl",
      expect.any(Array),
      expect.objectContaining({
        input: "content-type: application/json\nauthorization: Bearer test-token\n",
        stdio: ["pipe", "pipe", "ignore"],
      }),
    );
  });
});
