import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  dedupeStrings,
  isObject,
  type PushEventType,
  pushEventTypeValues,
} from "@vde-monitor/shared";

import type {
  NotificationSubscriptionRecord,
  PersistedNotifications,
  UpsertNotificationSubscriptionInput,
} from "./types";

const PUSH_EVENT_TYPE_SET = new Set<string>(pushEventTypeValues);

type StoreOptions = {
  filePath?: string;
  now?: () => string;
  createId?: () => string;
  logger?: Pick<Console, "warn">;
};

const getDefaultNotificationsPath = () => {
  return path.join(os.homedir(), ".vde-monitor", "notifications.json");
};

const isPushEventType = (value: unknown): value is PushEventType =>
  typeof value === "string" && PUSH_EVENT_TYPE_SET.has(value);

const cloneSubscriptionRecord = (
  record: NotificationSubscriptionRecord,
): NotificationSubscriptionRecord => ({
  ...record,
  keys: { ...record.keys },
  paneIds: [...record.paneIds],
  eventTypes: record.eventTypes ? [...record.eventTypes] : null,
});

const isNotificationSubscriptionRecord = (
  value: unknown,
): value is NotificationSubscriptionRecord => {
  if (!isObject(value)) {
    return false;
  }
  if (
    typeof value.id !== "string" ||
    typeof value.deviceId !== "string" ||
    typeof value.endpoint !== "string" ||
    (value.expirationTime != null && typeof value.expirationTime !== "number") ||
    !isObject(value.keys) ||
    typeof value.keys.p256dh !== "string" ||
    typeof value.keys.auth !== "string" ||
    !Array.isArray(value.paneIds) ||
    !value.paneIds.every((paneId) => typeof paneId === "string") ||
    ("eventTypes" in value &&
      value.eventTypes != null &&
      (!Array.isArray(value.eventTypes) ||
        !value.eventTypes.every((eventType) => isPushEventType(eventType)))) ||
    (value.platform !== "ios" &&
      value.platform !== "android" &&
      value.platform !== "desktop" &&
      value.platform !== "unknown") ||
    typeof value.standalone !== "boolean" ||
    (value.userAgent != null && typeof value.userAgent !== "string") ||
    typeof value.createdAt !== "string" ||
    typeof value.updatedAt !== "string" ||
    (value.lastDeliveredAt != null && typeof value.lastDeliveredAt !== "string") ||
    (value.lastDeliveryError != null && typeof value.lastDeliveryError !== "string")
  ) {
    return false;
  }
  return true;
};

const parsePersistedNotifications = (value: unknown): PersistedNotifications | null => {
  if (!isObject(value)) {
    return null;
  }
  if (
    value.version !== 1 ||
    typeof value.savedAt !== "string" ||
    !Array.isArray(value.subscriptions)
  ) {
    return null;
  }
  const subscriptions = value.subscriptions.filter(isNotificationSubscriptionRecord);
  return {
    version: 1,
    savedAt: value.savedAt,
    subscriptions: subscriptions.map(cloneSubscriptionRecord),
  };
};

const resolvePreferredRecord = (
  previous: NotificationSubscriptionRecord,
  next: NotificationSubscriptionRecord,
) => {
  const previousUpdatedAt = Date.parse(previous.updatedAt);
  const nextUpdatedAt = Date.parse(next.updatedAt);
  if (Number.isFinite(previousUpdatedAt) && Number.isFinite(nextUpdatedAt)) {
    return nextUpdatedAt >= previousUpdatedAt ? next : previous;
  }
  return next.updatedAt >= previous.updatedAt ? next : previous;
};

export const createNotificationSubscriptionStore = (options: StoreOptions = {}) => {
  const filePath = options.filePath ?? getDefaultNotificationsPath();
  const fileDirectoryPath = path.dirname(filePath);
  const now = options.now ?? (() => new Date().toISOString());
  const createId = options.createId ?? (() => `sub_${randomUUID()}`);
  const logger = options.logger ?? console;

  const subscriptionsById = new Map<string, NotificationSubscriptionRecord>();
  const subscriptionIdByDeviceId = new Map<string, string>();

  let dirEnsured = false;
  const ensureDir = () => {
    if (dirEnsured) {
      return;
    }
    fs.mkdirSync(fileDirectoryPath, { recursive: true, mode: 0o700 });
    dirEnsured = true;
  };

  const writeFileSafe = (content: string) => {
    const tempFilePath = path.join(
      fileDirectoryPath,
      `${path.basename(filePath)}.${process.pid}.${randomUUID()}.tmp`,
    );
    try {
      fs.writeFileSync(tempFilePath, content, {
        encoding: "utf8",
        mode: 0o600,
      });
      fs.renameSync(tempFilePath, filePath);
    } catch (error) {
      try {
        fs.rmSync(tempFilePath, { force: true });
      } catch {
        // ignore
      }
      throw error;
    }
    try {
      fs.chmodSync(filePath, 0o600);
    } catch {
      // ignore
    }
  };

  const serialize = (): PersistedNotifications => ({
    version: 1,
    savedAt: now(),
    subscriptions: Array.from(subscriptionsById.values()).map(cloneSubscriptionRecord),
  });

  const persist = () => {
    const content = `${JSON.stringify(serialize(), null, 2)}\n`;
    try {
      writeFileSafe(content);
    } catch (error) {
      const errorCode = (error as NodeJS.ErrnoException).code;
      if (errorCode !== "ENOENT") {
        throw error;
      }
      dirEnsured = false;
      ensureDir();
      writeFileSafe(content);
    }
  };

  const rebuildDeviceMap = () => {
    subscriptionIdByDeviceId.clear();
    subscriptionsById.forEach((record) => {
      subscriptionIdByDeviceId.set(record.deviceId, record.id);
    });
  };

  const restoreFromRecords = (records: NotificationSubscriptionRecord[]) => {
    subscriptionsById.clear();
    const recordByDeviceId = new Map<string, NotificationSubscriptionRecord>();
    records.forEach((record) => {
      const existing = recordByDeviceId.get(record.deviceId);
      if (!existing) {
        recordByDeviceId.set(record.deviceId, cloneSubscriptionRecord(record));
        return;
      }
      recordByDeviceId.set(record.deviceId, resolvePreferredRecord(existing, record));
    });
    recordByDeviceId.forEach((record) => {
      subscriptionsById.set(record.id, record);
    });
    rebuildDeviceMap();
  };

  const load = () => {
    try {
      const raw = fs.readFileSync(filePath, "utf8");
      const parsed = JSON.parse(raw) as unknown;
      const persisted = parsePersistedNotifications(parsed);
      if (!persisted) {
        return;
      }
      restoreFromRecords(persisted.subscriptions);
    } catch (error) {
      const errorCode = (error as NodeJS.ErrnoException).code;
      if (errorCode !== "ENOENT") {
        const message = error instanceof Error ? error.message : String(error);
        logger.warn(`[vde-monitor] notification subscriptions restore failed: ${message}`);
      }
    }
  };

  ensureDir();
  load();

  const list = () => {
    return Array.from(subscriptionsById.values()).map(cloneSubscriptionRecord);
  };

  const upsert = (input: UpsertNotificationSubscriptionInput) => {
    const existingId = subscriptionIdByDeviceId.get(input.deviceId);
    const existingRecord = existingId ? (subscriptionsById.get(existingId) ?? null) : null;
    const timestamp = now();

    const nextRecord: NotificationSubscriptionRecord = {
      id: existingRecord?.id ?? createId(),
      deviceId: input.deviceId,
      endpoint: input.subscription.endpoint,
      expirationTime: input.subscription.expirationTime ?? null,
      keys: {
        p256dh: input.subscription.keys.p256dh,
        auth: input.subscription.keys.auth,
      },
      paneIds: dedupeStrings(input.scope.paneIds),
      eventTypes: input.scope.eventTypes == null ? null : dedupeStrings(input.scope.eventTypes),
      platform: input.client?.platform ?? "unknown",
      standalone: input.client?.standalone ?? false,
      userAgent: input.client?.userAgent?.trim() ? input.client.userAgent.trim() : null,
      createdAt: existingRecord?.createdAt ?? timestamp,
      updatedAt: timestamp,
      lastDeliveredAt: existingRecord?.lastDeliveredAt ?? null,
      lastDeliveryError: existingRecord?.lastDeliveryError ?? null,
    };

    subscriptionsById.set(nextRecord.id, nextRecord);
    subscriptionIdByDeviceId.set(nextRecord.deviceId, nextRecord.id);
    persist();
    return {
      subscription: cloneSubscriptionRecord(nextRecord),
      created: existingRecord == null,
      savedAt: timestamp,
    };
  };

  const removeById = (subscriptionId: string) => {
    const existing = subscriptionsById.get(subscriptionId);
    if (!existing) {
      return false;
    }
    subscriptionsById.delete(subscriptionId);
    if (subscriptionIdByDeviceId.get(existing.deviceId) === subscriptionId) {
      subscriptionIdByDeviceId.delete(existing.deviceId);
    }
    persist();
    return true;
  };

  const removeByPredicate = (predicate: (record: NotificationSubscriptionRecord) => boolean) => {
    const removable = Array.from(subscriptionsById.values())
      .filter(predicate)
      .map((record) => record.id);
    if (removable.length === 0) {
      return 0;
    }
    removable.forEach((subscriptionId) => {
      const existing = subscriptionsById.get(subscriptionId);
      if (!existing) {
        return;
      }
      subscriptionsById.delete(subscriptionId);
      if (subscriptionIdByDeviceId.get(existing.deviceId) === subscriptionId) {
        subscriptionIdByDeviceId.delete(existing.deviceId);
      }
    });
    persist();
    return removable.length;
  };

  const revoke = ({
    subscriptionId,
    endpoint,
    deviceId,
  }: {
    subscriptionId?: string;
    endpoint?: string;
    deviceId?: string;
  }) => {
    return removeByPredicate(
      (record) =>
        (subscriptionId != null && record.id === subscriptionId) ||
        (endpoint != null && record.endpoint === endpoint) ||
        (deviceId != null && record.deviceId === deviceId),
    );
  };

  const removeAll = () => {
    if (subscriptionsById.size === 0) {
      return 0;
    }
    const removedCount = subscriptionsById.size;
    subscriptionsById.clear();
    subscriptionIdByDeviceId.clear();
    persist();
    return removedCount;
  };

  const markDelivered = (subscriptionId: string, deliveredAt = now()) => {
    const existing = subscriptionsById.get(subscriptionId);
    if (!existing) {
      return false;
    }
    subscriptionsById.set(subscriptionId, {
      ...existing,
      updatedAt: deliveredAt,
      lastDeliveredAt: deliveredAt,
      lastDeliveryError: null,
    });
    persist();
    return true;
  };

  const markDeliveryError = (subscriptionId: string, message: string, at = now()) => {
    const existing = subscriptionsById.get(subscriptionId);
    if (!existing) {
      return false;
    }
    subscriptionsById.set(subscriptionId, {
      ...existing,
      updatedAt: at,
      lastDeliveryError: message,
    });
    persist();
    return true;
  };

  return {
    list,
    upsert,
    removeById,
    revoke,
    removeAll,
    markDelivered,
    markDeliveryError,
  };
};

export type NotificationSubscriptionStore = ReturnType<typeof createNotificationSubscriptionStore>;
