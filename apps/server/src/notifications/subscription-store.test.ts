import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createNotificationSubscriptionStore } from "./subscription-store";

const tempDirs: string[] = [];

const createTempPath = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vde-monitor-notifications-"));
  tempDirs.push(dir);
  return path.join(dir, "notifications.json");
};

const createUpsertInput = (deviceId: string, endpoint: string) => ({
  deviceId,
  subscription: {
    endpoint,
    expirationTime: null,
    keys: {
      p256dh: "abc_DEF-123",
      auth: "xyz_DEF-456",
    },
  },
  scope: {
    paneIds: ["%1"],
    eventTypes: null,
  },
  client: {
    platform: "desktop" as const,
    standalone: false,
  },
});

afterEach(() => {
  tempDirs.splice(0).forEach((dir) => {
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe("createNotificationSubscriptionStore", () => {
  it("upserts by deviceId and keeps a single record", () => {
    const filePath = createTempPath();
    let seq = 0;
    const store = createNotificationSubscriptionStore({
      filePath,
      createId: () => `sub-${++seq}`,
      now: () => "2026-02-20T00:00:00.000Z",
    });

    const first = store.upsert(createUpsertInput("device-1", "https://push.example/sub/1"));
    const second = store.upsert(createUpsertInput("device-1", "https://push.example/sub/2"));

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.subscription.id).toBe(first.subscription.id);
    expect(store.list()).toHaveLength(1);
    expect(store.list()[0]?.endpoint).toBe("https://push.example/sub/2");
  });

  it("revokes by deviceId", () => {
    const store = createNotificationSubscriptionStore({
      filePath: createTempPath(),
      createId: (() => {
        let seq = 0;
        return () => `sub-${++seq}`;
      })(),
      now: () => "2026-02-20T00:00:00.000Z",
    });
    store.upsert(createUpsertInput("device-1", "https://push.example/sub/1"));
    store.upsert(createUpsertInput("device-2", "https://push.example/sub/2"));

    const removedCount = store.revoke({ deviceId: "device-1" });

    expect(removedCount).toBe(1);
    expect(store.list()).toHaveLength(1);
    expect(store.list()[0]?.deviceId).toBe("device-2");
  });

  it("removes all subscriptions", () => {
    const store = createNotificationSubscriptionStore({
      filePath: createTempPath(),
      createId: (() => {
        let seq = 0;
        return () => `sub-${++seq}`;
      })(),
      now: () => "2026-02-20T00:00:00.000Z",
    });
    store.upsert(createUpsertInput("device-1", "https://push.example/sub/1"));
    store.upsert(createUpsertInput("device-2", "https://push.example/sub/2"));

    const removed = store.removeAll();

    expect(removed).toBe(2);
    expect(store.list()).toHaveLength(0);
  });

  it("persists subscriptions to disk", () => {
    const filePath = createTempPath();
    const store = createNotificationSubscriptionStore({
      filePath,
      createId: () => "sub-1",
      now: () => "2026-02-20T00:00:00.000Z",
    });
    store.upsert(createUpsertInput("device-1", "https://push.example/sub/1"));

    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw) as { subscriptions: Array<{ deviceId: string }> };

    expect(parsed.subscriptions).toHaveLength(1);
    expect(parsed.subscriptions[0]?.deviceId).toBe("device-1");
  });
});
