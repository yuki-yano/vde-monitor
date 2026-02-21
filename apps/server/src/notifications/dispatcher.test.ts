import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { type ConfigPushEventType, defaultConfig, type SessionDetail } from "@vde-monitor/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createNotificationDispatcher } from "./dispatcher";
import { createNotificationSubscriptionStore } from "./subscription-store";
import type { SessionTransitionEvent } from "./types";

const tempDirs: string[] = [];

const createTempStorePath = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vde-monitor-dispatcher-"));
  tempDirs.push(dir);
  return path.join(dir, "notifications.json");
};

const createDetail = (state: SessionDetail["state"], stateReason: string): SessionDetail => ({
  paneId: "%1",
  sessionName: "backend",
  windowIndex: 0,
  paneIndex: 0,
  windowActivity: null,
  paneActive: true,
  currentCommand: null,
  currentPath: "/repo",
  paneTty: "tty1",
  title: null,
  customTitle: null,
  repoRoot: "/repo",
  agent: "codex",
  state,
  stateReason,
  lastMessage: null,
  lastOutputAt: null,
  lastEventAt: "2026-02-20T00:00:00.000Z",
  lastInputAt: null,
  paneDead: false,
  alternateOn: false,
  pipeAttached: false,
  pipeConflict: false,
  startCommand: null,
  panePid: null,
});

const createTransition = (
  previous: SessionDetail | null,
  next: SessionDetail,
  source: SessionTransitionEvent["source"] = "poll",
): SessionTransitionEvent => ({
  paneId: "%1",
  previous,
  next,
  at: "2026-02-20T00:00:00.000Z",
  source,
});

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  tempDirs.splice(0).forEach((dir) => fs.rmSync(dir, { recursive: true, force: true }));
});

describe("createNotificationDispatcher", () => {
  it("sends waiting_permission notifications for eligible subscriptions", async () => {
    const config = {
      ...defaultConfig,
      token: "token",
      notifications: {
        pushEnabled: true,
        enabledEventTypes: [
          "pane.waiting_permission",
          "pane.task_completed",
        ] as ConfigPushEventType[],
      },
    };
    const store = createNotificationSubscriptionStore({
      filePath: createTempStorePath(),
      createId: () => "sub-1",
      now: () => "2026-02-20T00:00:00.000Z",
    });
    store.upsert({
      deviceId: "device-1",
      subscription: {
        endpoint: "https://push.example/sub/1",
        expirationTime: null,
        keys: { p256dh: "abc_DEF-123", auth: "xyz_DEF-456" },
      },
      scope: { paneIds: ["%1"], eventTypes: null },
      client: { platform: "desktop", standalone: false },
    });
    const sendNotification = vi.fn(async () => undefined);
    const logger = {
      log: vi.fn(),
      warn: vi.fn(),
    };
    const dispatcher = createNotificationDispatcher({
      config,
      subscriptionStore: store,
      sendNotification,
      logger,
      now: () => "2026-02-20T00:00:01.000Z",
      nowMs: () => 1000,
      sleep: async () => undefined,
    });

    await dispatcher.dispatchTransition(
      createTransition(createDetail("RUNNING", "poll"), createDetail("WAITING_PERMISSION", "poll")),
    );

    expect(sendNotification).toHaveBeenCalledTimes(1);
    expect(store.list()[0]?.lastDeliveredAt).toBe("2026-02-20T00:00:01.000Z");
    expect(logger.log).toHaveBeenCalledWith(
      expect.stringContaining("summary event=pane.waiting_permission"),
    );
  });

  it("follows global enabledEventTypes when scope.eventTypes is null", async () => {
    const config = {
      ...defaultConfig,
      token: "token",
      notifications: {
        pushEnabled: true,
        enabledEventTypes: ["pane.task_completed"] as ConfigPushEventType[],
      },
    };
    const store = createNotificationSubscriptionStore({
      filePath: createTempStorePath(),
      createId: () => "sub-1",
      now: () => "2026-02-20T00:00:00.000Z",
    });
    store.upsert({
      deviceId: "device-1",
      subscription: {
        endpoint: "https://push.example/sub/1",
        expirationTime: null,
        keys: { p256dh: "abc_DEF-123", auth: "xyz_DEF-456" },
      },
      scope: { paneIds: ["%1"], eventTypes: null },
      client: { platform: "desktop", standalone: false },
    });
    const sendNotification = vi.fn(async () => undefined);
    const dispatcher = createNotificationDispatcher({
      config,
      subscriptionStore: store,
      sendNotification,
      now: () => "2026-02-20T00:00:01.000Z",
      nowMs: () => 1000,
      sleep: async () => undefined,
      logger: { log: vi.fn(), warn: vi.fn() },
    });

    await dispatcher.dispatchTransition(
      createTransition(createDetail("RUNNING", "poll"), createDetail("WAITING_PERMISSION", "poll")),
    );

    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("sends task_completed on RUNNING -> WAITING_INPUT transition", async () => {
    const config = {
      ...defaultConfig,
      token: "token",
      notifications: {
        pushEnabled: true,
        enabledEventTypes: ["pane.task_completed"] as ConfigPushEventType[],
      },
    };
    const store = createNotificationSubscriptionStore({
      filePath: createTempStorePath(),
      createId: () => "sub-1",
      now: () => "2026-02-20T00:00:00.000Z",
    });
    store.upsert({
      deviceId: "device-1",
      subscription: {
        endpoint: "https://push.example/sub/1",
        expirationTime: null,
        keys: { p256dh: "abc_DEF-123", auth: "xyz_DEF-456" },
      },
      scope: { paneIds: ["%1"], eventTypes: null },
      client: { platform: "desktop", standalone: false },
    });
    const sendNotification = vi.fn(async () => undefined);
    const logger = {
      log: vi.fn(),
      warn: vi.fn(),
    };
    const dispatcher = createNotificationDispatcher({
      config,
      subscriptionStore: store,
      sendNotification,
      logger,
      now: () => "2026-02-20T00:00:01.000Z",
      nowMs: () => 1000,
      sleep: async () => undefined,
    });

    await dispatcher.dispatchTransition(
      createTransition(
        createDetail("RUNNING", "recent_output"),
        createDetail("WAITING_INPUT", "inactive_timeout"),
      ),
    );

    expect(sendNotification).toHaveBeenCalledTimes(1);
    expect(logger.log).toHaveBeenCalledWith(
      expect.stringContaining("summary event=pane.task_completed"),
    );
  });

  it("retries transient failures with backoff", async () => {
    const config = {
      ...defaultConfig,
      token: "token",
      notifications: {
        pushEnabled: true,
        enabledEventTypes: [
          "pane.waiting_permission",
          "pane.task_completed",
        ] as ConfigPushEventType[],
      },
    };
    const store = createNotificationSubscriptionStore({
      filePath: createTempStorePath(),
      createId: () => "sub-1",
      now: () => "2026-02-20T00:00:00.000Z",
    });
    store.upsert({
      deviceId: "device-1",
      subscription: {
        endpoint: "https://push.example/sub/1",
        expirationTime: null,
        keys: { p256dh: "abc_DEF-123", auth: "xyz_DEF-456" },
      },
      scope: { paneIds: ["%1"], eventTypes: null },
      client: { platform: "desktop", standalone: false },
    });
    const sendNotification = vi
      .fn(async () => undefined)
      .mockRejectedValueOnce({ statusCode: 503 })
      .mockResolvedValueOnce(undefined);
    const sleep = vi.fn(async () => undefined);
    const logger = {
      log: vi.fn(),
      warn: vi.fn(),
    };
    const dispatcher = createNotificationDispatcher({
      config,
      subscriptionStore: store,
      sendNotification,
      sleep,
      logger,
      now: () => "2026-02-20T00:00:01.000Z",
      nowMs: (() => {
        let current = 1000;
        return () => current++;
      })(),
    });

    await dispatcher.dispatchTransition(
      createTransition(createDetail("RUNNING", "poll"), createDetail("WAITING_PERMISSION", "poll")),
    );

    expect(sendNotification).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(500);
    expect(logger.log).toHaveBeenCalledWith(expect.stringContaining("result=retry"));
  });

  it("removes subscription immediately on 410", async () => {
    const config = {
      ...defaultConfig,
      token: "token",
      notifications: {
        pushEnabled: true,
        enabledEventTypes: [
          "pane.waiting_permission",
          "pane.task_completed",
        ] as ConfigPushEventType[],
      },
    };
    const store = createNotificationSubscriptionStore({
      filePath: createTempStorePath(),
      createId: () => "sub-1",
      now: () => "2026-02-20T00:00:00.000Z",
    });
    store.upsert({
      deviceId: "device-1",
      subscription: {
        endpoint: "https://push.example/sub/1",
        expirationTime: null,
        keys: { p256dh: "abc_DEF-123", auth: "xyz_DEF-456" },
      },
      scope: { paneIds: ["%1"], eventTypes: null },
      client: { platform: "desktop", standalone: false },
    });
    const sendNotification = vi.fn(async () => {
      throw { statusCode: 410 };
    });
    const dispatcher = createNotificationDispatcher({
      config,
      subscriptionStore: store,
      sendNotification,
      now: () => "2026-02-20T00:00:01.000Z",
      nowMs: () => 1000,
      sleep: async () => undefined,
      logger: { log: vi.fn(), warn: vi.fn() },
    });

    await dispatcher.dispatchTransition(
      createTransition(createDetail("RUNNING", "poll"), createDetail("WAITING_PERMISSION", "poll")),
    );

    expect(sendNotification).toHaveBeenCalledTimes(1);
    expect(store.list()).toHaveLength(0);
  });

  it("cleans subscription caches when expired subscription is removed", async () => {
    const config = {
      ...defaultConfig,
      token: "token",
      notifications: {
        pushEnabled: true,
        enabledEventTypes: [
          "pane.waiting_permission",
          "pane.task_completed",
        ] as ConfigPushEventType[],
      },
    };
    const store = createNotificationSubscriptionStore({
      filePath: createTempStorePath(),
      createId: () => "sub-1",
      now: () => "2026-02-20T00:00:00.000Z",
    });
    store.upsert({
      deviceId: "device-1",
      subscription: {
        endpoint: "https://push.example/sub/1",
        expirationTime: null,
        keys: { p256dh: "abc_DEF-123", auth: "xyz_DEF-456" },
      },
      scope: { paneIds: ["%1"], eventTypes: null },
      client: { platform: "desktop", standalone: false },
    });
    const sendNotification = vi
      .fn(async () => undefined)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce({ statusCode: 410 })
      .mockResolvedValueOnce(undefined);
    let currentNowMs = 1000;
    const dispatcher = createNotificationDispatcher({
      config,
      subscriptionStore: store,
      sendNotification,
      cooldownMs: 10_000,
      now: () => "2026-02-20T00:00:01.000Z",
      nowMs: () => currentNowMs,
      sleep: async () => undefined,
      logger: { log: vi.fn(), warn: vi.fn() },
    });

    await dispatcher.dispatchTransition(
      createTransition(createDetail("RUNNING", "poll"), {
        ...createDetail("WAITING_PERMISSION", "poll"),
        lastEventAt: "2026-02-20T00:00:01.000Z",
      }),
    );

    currentNowMs = 12_000;
    await dispatcher.dispatchTransition(
      createTransition(createDetail("RUNNING", "poll"), {
        ...createDetail("WAITING_PERMISSION", "poll"),
        lastEventAt: "2026-02-20T00:00:12.000Z",
      }),
    );
    expect(store.list()).toHaveLength(0);

    store.upsert({
      deviceId: "device-2",
      subscription: {
        endpoint: "https://push.example/sub/2",
        expirationTime: null,
        keys: { p256dh: "abc_DEF-123", auth: "xyz_DEF-456" },
      },
      scope: { paneIds: ["%1"], eventTypes: null },
      client: { platform: "desktop", standalone: false },
    });

    currentNowMs = 13_000;
    await dispatcher.dispatchTransition(
      createTransition(createDetail("RUNNING", "poll"), {
        ...createDetail("WAITING_PERMISSION", "poll"),
        lastEventAt: "2026-02-20T00:00:01.000Z",
      }),
    );

    expect(sendNotification).toHaveBeenCalledTimes(3);
  });

  it("reconciles stale caches after external subscription removal", async () => {
    const config = {
      ...defaultConfig,
      token: "token",
      notifications: {
        pushEnabled: true,
        enabledEventTypes: [
          "pane.waiting_permission",
          "pane.task_completed",
        ] as ConfigPushEventType[],
      },
    };
    const store = createNotificationSubscriptionStore({
      filePath: createTempStorePath(),
      createId: () => "sub-1",
      now: () => "2026-02-20T00:00:00.000Z",
    });
    store.upsert({
      deviceId: "device-1",
      subscription: {
        endpoint: "https://push.example/sub/1",
        expirationTime: null,
        keys: { p256dh: "abc_DEF-123", auth: "xyz_DEF-456" },
      },
      scope: { paneIds: ["%1"], eventTypes: null },
      client: { platform: "desktop", standalone: false },
    });

    const sendNotification = vi.fn(async () => undefined);
    let currentNowMs = 1000;
    const dispatcher = createNotificationDispatcher({
      config,
      subscriptionStore: store,
      sendNotification,
      cooldownMs: 60_000,
      now: () => "2026-02-20T00:00:01.000Z",
      nowMs: () => currentNowMs,
      sleep: async () => undefined,
      logger: { log: vi.fn(), warn: vi.fn() },
    });

    await dispatcher.dispatchTransition(
      createTransition(createDetail("RUNNING", "poll"), createDetail("WAITING_PERMISSION", "poll")),
    );
    expect(sendNotification).toHaveBeenCalledTimes(1);

    store.removeAll();
    store.upsert({
      deviceId: "device-2",
      subscription: {
        endpoint: "https://push.example/sub/2",
        expirationTime: null,
        keys: { p256dh: "abc_DEF-123", auth: "xyz_DEF-456" },
      },
      scope: { paneIds: ["%1"], eventTypes: null },
      client: { platform: "desktop", standalone: false },
    });

    currentNowMs = 1001;
    await dispatcher.dispatchTransition(
      createTransition(createDetail("RUNNING", "poll"), createDetail("WAITING_PERMISSION", "poll")),
    );

    expect(sendNotification).toHaveBeenCalledTimes(2);
  });

  it("skips transitions from restore source and first observation", async () => {
    const config = {
      ...defaultConfig,
      token: "token",
      notifications: {
        pushEnabled: true,
        enabledEventTypes: [
          "pane.waiting_permission",
          "pane.task_completed",
        ] as ConfigPushEventType[],
      },
    };
    const store = createNotificationSubscriptionStore({
      filePath: createTempStorePath(),
      createId: () => "sub-1",
      now: () => "2026-02-20T00:00:00.000Z",
    });
    store.upsert({
      deviceId: "device-1",
      subscription: {
        endpoint: "https://push.example/sub/1",
        expirationTime: null,
        keys: { p256dh: "abc_DEF-123", auth: "xyz_DEF-456" },
      },
      scope: { paneIds: ["%1"], eventTypes: null },
      client: { platform: "desktop", standalone: false },
    });
    const sendNotification = vi.fn(async () => undefined);
    const dispatcher = createNotificationDispatcher({
      config,
      subscriptionStore: store,
      sendNotification,
      now: () => "2026-02-20T00:00:01.000Z",
      nowMs: () => 1000,
      sleep: async () => undefined,
      logger: { log: vi.fn(), warn: vi.fn() },
    });

    await dispatcher.dispatchTransition(
      createTransition(null, createDetail("WAITING_PERMISSION", "poll"), "poll"),
    );
    await dispatcher.dispatchTransition(
      createTransition(
        createDetail("RUNNING", "poll"),
        createDetail("WAITING_PERMISSION", "poll"),
        "restore",
      ),
    );

    expect(sendNotification).not.toHaveBeenCalled();
  });
});
