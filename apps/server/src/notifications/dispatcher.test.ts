import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { type ConfigPushEventType, type SessionDetail, configDefaults } from "@vde-monitor/shared";
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
  sessionId: "$1",
  sessionName: "backend",
  windowId: "@0",
  windowIndex: 0,
  paneIndex: 0,
  paneActive: true,
  currentCommand: null,
  currentPath: "/repo",
  paneTty: "tty1",
  title: null,
  customTitle: null,
  repoRoot: "/repo",
  agent: "codex",
  completion: null,
  state,
  stateReason,
  lastMessage: null,
  lastOutputAt: null,
  lastEventAt: "2026-02-20T00:00:00.000Z",
  lastInputAt: null,
  lastRunStartedAt: null,
  manualSortAt: null,
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
  completion: Partial<
    Pick<SessionTransitionEvent, "completionAdvanced" | "completionEpoch" | "completedSeq">
  > = {},
): SessionTransitionEvent => ({
  paneId: "%1",
  previous,
  next,
  at: "2026-02-20T00:00:00.000Z",
  source,
  completionAdvanced: false,
  completionEpoch: null,
  completedSeq: null,
  ...completion,
});

type SendNotificationFn = NonNullable<
  Parameters<typeof createNotificationDispatcher>[0]["sendNotification"]
>;

const createDispatcherUnderTest = ({
  enabledEventTypes = ["pane.waiting_permission", "pane.task_completed"] as ConfigPushEventType[],
  cooldownMs,
  nowMs = () => 1000,
  sendNotification = vi.fn(async () => undefined) as SendNotificationFn,
  sleep = async () => undefined,
}: {
  enabledEventTypes?: ConfigPushEventType[];
  cooldownMs?: number;
  nowMs?: () => number;
  sendNotification?: SendNotificationFn;
  sleep?: (ms: number) => Promise<void>;
} = {}) => {
  const config = {
    ...configDefaults,
    token: "token",
    notifications: {
      ...configDefaults.notifications,
      pushEnabled: true,
      enabledEventTypes,
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
    nowMs,
    sleep,
    ...(cooldownMs !== undefined ? { cooldownMs } : {}),
  });
  return { dispatcher, store, logger, sendNotification };
};

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  tempDirs.splice(0).forEach((dir) => fs.rmSync(dir, { recursive: true, force: true }));
});

describe("createNotificationDispatcher", () => {
  it("sends waiting_permission notifications for eligible subscriptions", async () => {
    const { dispatcher, store, logger, sendNotification } = createDispatcherUnderTest();

    await dispatcher.dispatchTransition(
      createTransition(
        createDetail("RUNNING", "poll"),
        createDetail("WAITING_PERMISSION", "hook:permission_prompt"),
      ),
    );

    expect(sendNotification).toHaveBeenCalledTimes(1);
    expect(store.list()[0]?.lastDeliveredAt).toBe("2026-02-20T00:00:01.000Z");
    expect(logger.log).toHaveBeenCalledWith(
      expect.stringContaining("summary event=pane.waiting_permission"),
    );
  });

  it("sends waiting_permission for hook:permission_request", async () => {
    const { dispatcher, sendNotification } = createDispatcherUnderTest();

    await dispatcher.dispatchTransition(
      createTransition(
        createDetail("RUNNING", "poll"),
        createDetail("WAITING_PERMISSION", "hook:permission_request"),
      ),
    );

    expect(sendNotification).toHaveBeenCalledTimes(1);
  });

  it("sends waiting_permission for poll:codex_question_prompt", async () => {
    const { dispatcher, sendNotification } = createDispatcherUnderTest();

    await dispatcher.dispatchTransition(
      createTransition(
        createDetail("RUNNING", "poll"),
        createDetail("WAITING_PERMISSION", "poll:codex_question_prompt"),
      ),
    );

    expect(sendNotification).toHaveBeenCalledTimes(1);
  });

  it("does not send waiting_permission for unsupported poll reason", async () => {
    const { dispatcher, sendNotification } = createDispatcherUnderTest();

    await dispatcher.dispatchTransition(
      createTransition(createDetail("RUNNING", "poll"), createDetail("WAITING_PERMISSION", "poll")),
    );

    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("follows global enabledEventTypes when scope.eventTypes is null", async () => {
    const { dispatcher, sendNotification } = createDispatcherUnderTest({
      enabledEventTypes: ["pane.task_completed"],
    });

    await dispatcher.dispatchTransition(
      createTransition(
        createDetail("RUNNING", "poll"),
        createDetail("WAITING_PERMISSION", "hook:permission_prompt"),
      ),
    );

    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("sends task_completed when a completion generation advances", async () => {
    const { dispatcher, logger, sendNotification } = createDispatcherUnderTest({
      enabledEventTypes: ["pane.task_completed"],
    });

    await dispatcher.dispatchTransition(
      createTransition(
        createDetail("RUNNING", "recent_output"),
        createDetail("DONE", "completion:pending"),
        "hook",
        { completionAdvanced: true, completionEpoch: "epoch-1", completedSeq: 1 },
      ),
    );

    expect(sendNotification).toHaveBeenCalledTimes(1);
    expect(logger.log).toHaveBeenCalledWith(
      expect.stringContaining("summary event=pane.task_completed"),
    );
  });

  it("does not infer task completion from a public state edge", async () => {
    const { dispatcher, sendNotification } = createDispatcherUnderTest({
      enabledEventTypes: ["pane.task_completed"],
    });

    await dispatcher.dispatchTransition(
      createTransition(
        createDetail("RUNNING", "recent_output"),
        createDetail("WAITING_INPUT", "inactive_timeout"),
      ),
    );

    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("does not suppress distinct completion generations during the cooldown", async () => {
    const { dispatcher, sendNotification } = createDispatcherUnderTest({
      enabledEventTypes: ["pane.task_completed"],
      cooldownMs: 30_000,
      nowMs: () => 1_000,
    });

    await dispatcher.dispatchTransition(
      createTransition(null, createDetail("DONE", "completion:pending"), "hook", {
        completionAdvanced: true,
        completionEpoch: "epoch-1",
        completedSeq: 1,
      }),
    );
    await dispatcher.dispatchTransition(
      createTransition(
        createDetail("RUNNING", "hook:UserPromptSubmit"),
        createDetail("DONE", "completion:pending"),
        "hook",
        { completionAdvanced: true, completionEpoch: "epoch-1", completedSeq: 2 },
      ),
    );

    expect(sendNotification).toHaveBeenCalledTimes(2);
  });

  it("deduplicates the same completion generation fingerprint", async () => {
    const { dispatcher, sendNotification } = createDispatcherUnderTest({
      enabledEventTypes: ["pane.task_completed"],
    });
    const transition = createTransition(
      createDetail("RUNNING", "hook:UserPromptSubmit"),
      createDetail("DONE", "completion:pending"),
      "hook",
      { completionAdvanced: true, completionEpoch: "epoch-1", completedSeq: 1 },
    );

    await dispatcher.dispatchTransition(transition);
    await dispatcher.dispatchTransition(transition);

    expect(sendNotification).toHaveBeenCalledTimes(1);
  });

  it("does not notify for acknowledgement or restore commits", async () => {
    const { dispatcher, sendNotification } = createDispatcherUnderTest({
      enabledEventTypes: ["pane.task_completed"],
    });

    await dispatcher.dispatchTransition(
      createTransition(
        createDetail("DONE", "completion:pending"),
        createDetail("WAITING_INPUT", "view:acknowledged"),
        "view",
      ),
    );
    await dispatcher.dispatchTransition(
      createTransition(null, createDetail("DONE", "restored"), "restore", {
        completionAdvanced: true,
        completionEpoch: "epoch-1",
        completedSeq: 1,
      }),
    );

    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("retries transient failures with backoff", async () => {
    const sendNotification = vi
      .fn(async () => undefined)
      .mockRejectedValueOnce({ statusCode: 503 })
      .mockResolvedValueOnce(undefined) as SendNotificationFn;
    const sleep = vi.fn(async () => undefined);
    const { dispatcher, logger } = createDispatcherUnderTest({
      sendNotification,
      sleep,
      nowMs: (() => {
        let current = 1000;
        return () => current++;
      })(),
    });

    await dispatcher.dispatchTransition(
      createTransition(
        createDetail("RUNNING", "poll"),
        createDetail("WAITING_PERMISSION", "hook:permission_prompt"),
      ),
    );

    expect(sendNotification).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(500);
    expect(logger.log).toHaveBeenCalledWith(expect.stringContaining("result=retry"));
  });

  it("removes subscription immediately on 410", async () => {
    const sendNotification = vi.fn(async () => {
      throw { statusCode: 410 };
    }) as SendNotificationFn;
    const { dispatcher, store } = createDispatcherUnderTest({ sendNotification });

    await dispatcher.dispatchTransition(
      createTransition(
        createDetail("RUNNING", "poll"),
        createDetail("WAITING_PERMISSION", "hook:permission_prompt"),
      ),
    );

    expect(sendNotification).toHaveBeenCalledTimes(1);
    expect(store.list()).toHaveLength(0);
  });

  it("cleans subscription caches when expired subscription is removed", async () => {
    const sendNotification = vi
      .fn(async () => undefined)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce({ statusCode: 410 })
      .mockResolvedValueOnce(undefined) as SendNotificationFn;
    let currentNowMs = 1000;
    const { dispatcher, store } = createDispatcherUnderTest({
      sendNotification,
      cooldownMs: 10_000,
      nowMs: () => currentNowMs,
    });

    await dispatcher.dispatchTransition(
      createTransition(createDetail("RUNNING", "poll"), {
        ...createDetail("WAITING_PERMISSION", "hook:permission_prompt"),
        lastEventAt: "2026-02-20T00:00:01.000Z",
      }),
    );

    currentNowMs = 12_000;
    await dispatcher.dispatchTransition(
      createTransition(createDetail("RUNNING", "poll"), {
        ...createDetail("WAITING_PERMISSION", "hook:permission_prompt"),
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
        ...createDetail("WAITING_PERMISSION", "hook:permission_prompt"),
        lastEventAt: "2026-02-20T00:00:01.000Z",
      }),
    );

    expect(sendNotification).toHaveBeenCalledTimes(3);
  });

  it("reconciles stale caches after external subscription removal", async () => {
    const sendNotification = vi.fn(async () => undefined) as SendNotificationFn;
    let currentNowMs = 1000;
    const { dispatcher, store } = createDispatcherUnderTest({
      sendNotification,
      cooldownMs: 60_000,
      nowMs: () => currentNowMs,
    });

    await dispatcher.dispatchTransition(
      createTransition(
        createDetail("RUNNING", "poll"),
        createDetail("WAITING_PERMISSION", "hook:permission_prompt"),
      ),
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
      createTransition(
        createDetail("RUNNING", "poll"),
        createDetail("WAITING_PERMISSION", "hook:permission_prompt"),
      ),
    );

    expect(sendNotification).toHaveBeenCalledTimes(2);
  });

  it("skips transitions from restore source and first observation", async () => {
    const { dispatcher, sendNotification } = createDispatcherUnderTest();

    await dispatcher.dispatchTransition(
      createTransition(null, createDetail("WAITING_PERMISSION", "hook:permission_prompt"), "poll"),
    );
    await dispatcher.dispatchTransition(
      createTransition(
        createDetail("RUNNING", "poll"),
        createDetail("WAITING_PERMISSION", "hook:permission_prompt"),
        "restore",
      ),
    );

    expect(sendNotification).not.toHaveBeenCalled();
  });
});
