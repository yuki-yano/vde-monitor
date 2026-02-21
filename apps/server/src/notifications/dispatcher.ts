import type { AgentMonitorConfig, PushEventType, PushSubscriptionJson } from "@vde-monitor/shared";
import webpush from "web-push";

import { toErrorMessage } from "../errors";
import type { NotificationSubscriptionStore } from "./subscription-store";
import type { NotificationPayload, SessionTransitionEvent } from "./types";

type DispatcherOptions = {
  config: AgentMonitorConfig;
  subscriptionStore: NotificationSubscriptionStore;
  sendNotification?: (subscription: PushSubscriptionJson, payload: string) => Promise<void>;
  now?: () => string;
  nowMs?: () => number;
  sleep?: (ms: number) => Promise<void>;
  logger?: Pick<Console, "log" | "warn">;
  retryDelaysMs?: [number, number];
  cooldownMs?: number;
  consecutiveFailureWarnThreshold?: number;
};

const DEFAULT_RETRY_DELAYS_MS: [number, number] = [500, 1500];
const DEFAULT_COOLDOWN_MS = 30_000;
const DEFAULT_WARN_THRESHOLD = 3;

const resolveTransitionEventType = (event: SessionTransitionEvent): PushEventType | null => {
  if (event.previous == null) {
    return null;
  }
  if (event.source === "restore") {
    return null;
  }
  if (
    event.previous.state === event.next.state &&
    event.previous.stateReason === event.next.stateReason
  ) {
    return null;
  }
  if (event.next.state === "WAITING_PERMISSION") {
    return "pane.waiting_permission";
  }
  if (event.next.state === "WAITING_INPUT" && event.previous.state === "RUNNING") {
    return "pane.task_completed";
  }
  return null;
};

const buildNotificationPayload = (
  eventType: PushEventType,
  event: SessionTransitionEvent,
  now: () => string,
): NotificationPayload => {
  const paneLabel = `${event.next.sessionName}:w${event.next.windowIndex}:${event.next.paneId}`;
  if (eventType === "pane.waiting_permission") {
    return {
      version: 1,
      type: "session.state.changed",
      eventType,
      paneId: event.next.paneId,
      sessionName: event.next.sessionName,
      title: "Permission required",
      body: `${paneLabel} is waiting for permission`,
      url: `/sessions/${encodeURIComponent(event.next.paneId)}`,
      tag: `pane:${event.next.paneId}:waiting_permission`,
      ts: now(),
    };
  }
  return {
    version: 1,
    type: "session.state.changed",
    eventType,
    paneId: event.next.paneId,
    sessionName: event.next.sessionName,
    title: "Task completed",
    body: `${paneLabel} completed and is now waiting for input`,
    url: `/sessions/${encodeURIComponent(event.next.paneId)}`,
    tag: `pane:${event.next.paneId}:task_completed`,
    ts: now(),
  };
};

const normalizeStatusCode = (error: unknown) => {
  if (error == null || typeof error !== "object") {
    return null;
  }
  const maybeStatusCode = (error as { statusCode?: unknown }).statusCode;
  if (typeof maybeStatusCode === "number" && Number.isFinite(maybeStatusCode)) {
    return maybeStatusCode;
  }
  return null;
};

const isExpiredEndpointError = (error: unknown) => {
  const statusCode = normalizeStatusCode(error);
  return statusCode === 404 || statusCode === 410;
};

const isRetryableDeliveryError = (error: unknown) => {
  const statusCode = normalizeStatusCode(error);
  if (statusCode == null) {
    return true;
  }
  if (statusCode === 429) {
    return true;
  }
  return statusCode >= 500;
};

const normalizeErrorBody = (error: unknown) => {
  if (error == null || typeof error !== "object") {
    return null;
  }
  const body = (error as { body?: unknown }).body;
  if (typeof body !== "string" || body.length === 0) {
    return null;
  }
  return body;
};

const toPushSubscriptionJson = (record: {
  endpoint: string;
  expirationTime: number | null;
  keys: { p256dh: string; auth: string };
}): PushSubscriptionJson => ({
  endpoint: record.endpoint,
  expirationTime: record.expirationTime,
  keys: {
    p256dh: record.keys.p256dh,
    auth: record.keys.auth,
  },
});

const resolveFingerprint = (event: SessionTransitionEvent) => {
  return `${event.paneId}:${event.next.state}:${event.next.stateReason}:${event.next.lastEventAt ?? event.at}`;
};

export const createNotificationDispatcher = ({
  config,
  subscriptionStore,
  sendNotification = async (subscription, payload) => {
    await webpush.sendNotification(subscription, payload);
  },
  now = () => new Date().toISOString(),
  nowMs = () => Date.now(),
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  logger = console,
  retryDelaysMs = DEFAULT_RETRY_DELAYS_MS,
  cooldownMs = DEFAULT_COOLDOWN_MS,
  consecutiveFailureWarnThreshold = DEFAULT_WARN_THRESHOLD,
}: DispatcherOptions) => {
  const lastFingerprintBySubscriptionId = new Map<string, string>();
  const lastSentAtByPaneEventBySubscriptionId = new Map<string, number>();
  const consecutiveFailureCountBySubscriptionId = new Map<string, number>();
  const endpointBySubscriptionId = new Map<string, string>();
  const cleanupSubscriptionCache = (subscriptionId: string) => {
    lastFingerprintBySubscriptionId.delete(subscriptionId);
    consecutiveFailureCountBySubscriptionId.delete(subscriptionId);
    endpointBySubscriptionId.delete(subscriptionId);
    const cooldownKeyPrefix = `${subscriptionId}:`;
    Array.from(lastSentAtByPaneEventBySubscriptionId.keys()).forEach((key) => {
      if (key.startsWith(cooldownKeyPrefix)) {
        lastSentAtByPaneEventBySubscriptionId.delete(key);
      }
    });
  };
  const reconcileSubscriptionCaches = (
    subscriptions: Array<{
      id: string;
      endpoint: string;
    }>,
  ) => {
    const activeSubscriptionIds = new Set(subscriptions.map((subscription) => subscription.id));
    subscriptions.forEach((subscription) => {
      const previousEndpoint = endpointBySubscriptionId.get(subscription.id);
      if (previousEndpoint != null && previousEndpoint !== subscription.endpoint) {
        cleanupSubscriptionCache(subscription.id);
      }
      endpointBySubscriptionId.set(subscription.id, subscription.endpoint);
    });
    Array.from(lastFingerprintBySubscriptionId.keys()).forEach((subscriptionId) => {
      if (!activeSubscriptionIds.has(subscriptionId)) {
        cleanupSubscriptionCache(subscriptionId);
      }
    });
    Array.from(consecutiveFailureCountBySubscriptionId.keys()).forEach((subscriptionId) => {
      if (!activeSubscriptionIds.has(subscriptionId)) {
        cleanupSubscriptionCache(subscriptionId);
      }
    });
    Array.from(lastSentAtByPaneEventBySubscriptionId.keys()).forEach((cooldownKey) => {
      const separatorIndex = cooldownKey.indexOf(":");
      const subscriptionId =
        separatorIndex >= 0 ? cooldownKey.slice(0, separatorIndex) : cooldownKey;
      if (!activeSubscriptionIds.has(subscriptionId)) {
        cleanupSubscriptionCache(subscriptionId);
      }
    });
  };

  const dispatchTransition = async (event: SessionTransitionEvent) => {
    const eventType = resolveTransitionEventType(event);
    if (!eventType) {
      return;
    }
    if (!config.notifications.pushEnabled) {
      return;
    }

    const globalEnabledEventTypes = new Set<PushEventType>(config.notifications.enabledEventTypes);
    if (!globalEnabledEventTypes.has(eventType)) {
      return;
    }

    const subscriptions = subscriptionStore.list();
    reconcileSubscriptionCaches(subscriptions);
    const candidates = subscriptions.filter((subscription) => {
      if (!subscription.paneIds.includes(event.paneId)) {
        return false;
      }
      const effectiveEventTypes =
        subscription.eventTypes == null
          ? config.notifications.enabledEventTypes
          : subscription.eventTypes.filter((type) => globalEnabledEventTypes.has(type));
      return effectiveEventTypes.includes(eventType);
    });

    const startedAtMs = nowMs();
    const payload = buildNotificationPayload(eventType, event, now);
    const payloadRaw = JSON.stringify(payload);
    const fingerprint = resolveFingerprint(event);

    const outcomes = await Promise.all(
      candidates.map(async (subscription) => {
        let localSentCount = 0;
        let localRetryCount = 0;
        let localFailedCount = 0;
        let localExpiredCount = 0;
        const previousFingerprint = lastFingerprintBySubscriptionId.get(subscription.id);
        if (previousFingerprint === fingerprint) {
          return {
            sentCount: localSentCount,
            retryCount: localRetryCount,
            failedCount: localFailedCount,
            expiredCount: localExpiredCount,
          };
        }
        const cooldownKey = `${subscription.id}:${event.paneId}:${eventType}`;
        const previousSentAtMs = lastSentAtByPaneEventBySubscriptionId.get(cooldownKey);
        if (previousSentAtMs != null && nowMs() - previousSentAtMs < cooldownMs) {
          return {
            sentCount: localSentCount,
            retryCount: localRetryCount,
            failedCount: localFailedCount,
            expiredCount: localExpiredCount,
          };
        }

        const maxAttempts = 3;
        for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
          try {
            await sendNotification(toPushSubscriptionJson(subscription), payloadRaw);
            const deliveredAt = now();
            subscriptionStore.markDelivered(subscription.id, deliveredAt);
            localSentCount += 1;
            lastFingerprintBySubscriptionId.set(subscription.id, fingerprint);
            lastSentAtByPaneEventBySubscriptionId.set(cooldownKey, nowMs());
            consecutiveFailureCountBySubscriptionId.delete(subscription.id);
            logger.log(
              `[vde-monitor][push] event=${eventType} paneId=${event.paneId} subscriptionId=${subscription.id} attempt=${attempt} result=ok`,
            );
            break;
          } catch (error) {
            if (isExpiredEndpointError(error)) {
              subscriptionStore.removeById(subscription.id);
              localExpiredCount += 1;
              cleanupSubscriptionCache(subscription.id);
              logger.log(
                `[vde-monitor][push] event=${eventType} paneId=${event.paneId} subscriptionId=${subscription.id} attempt=${attempt} result=expired`,
              );
              break;
            }

            const retryable = isRetryableDeliveryError(error);
            if (retryable && attempt < maxAttempts) {
              localRetryCount += 1;
              logger.log(
                `[vde-monitor][push] event=${eventType} paneId=${event.paneId} subscriptionId=${subscription.id} attempt=${attempt} result=retry statusCode=${normalizeStatusCode(error) ?? "unknown"}`,
              );
              const retryDelayMs =
                retryDelaysMs[attempt - 1] ??
                retryDelaysMs[retryDelaysMs.length - 1] ??
                DEFAULT_RETRY_DELAYS_MS[1];
              await sleep(retryDelayMs);
              continue;
            }

            localFailedCount += 1;
            const message = toErrorMessage(error, "push delivery failed");
            subscriptionStore.markDeliveryError(subscription.id, message, now());
            const nextFailureCount =
              (consecutiveFailureCountBySubscriptionId.get(subscription.id) ?? 0) + 1;
            consecutiveFailureCountBySubscriptionId.set(subscription.id, nextFailureCount);
            if (nextFailureCount >= consecutiveFailureWarnThreshold) {
              logger.warn(
                `[vde-monitor][push] repeated delivery failures subscriptionId=${subscription.id} count=${nextFailureCount}`,
              );
            }
            const statusCode = normalizeStatusCode(error);
            const responseBody = normalizeErrorBody(error);
            logger.log(
              `[vde-monitor][push] event=${eventType} paneId=${event.paneId} subscriptionId=${subscription.id} attempt=${attempt} result=fail statusCode=${statusCode ?? "unknown"} message=${JSON.stringify(message)} body=${JSON.stringify(responseBody)}`,
            );
            break;
          }
        }
        return {
          sentCount: localSentCount,
          retryCount: localRetryCount,
          failedCount: localFailedCount,
          expiredCount: localExpiredCount,
        };
      }),
    );
    const sentCount = outcomes.reduce((total, item) => total + item.sentCount, 0);
    const retryCount = outcomes.reduce((total, item) => total + item.retryCount, 0);
    const failedCount = outcomes.reduce((total, item) => total + item.failedCount, 0);
    const expiredCount = outcomes.reduce((total, item) => total + item.expiredCount, 0);

    logger.log(
      `[vde-monitor][push] summary event=${eventType} paneId=${event.paneId} candidateCount=${candidates.length} sentCount=${sentCount} retryCount=${retryCount} failedCount=${failedCount} expiredCount=${expiredCount} elapsedMs=${Math.max(
        0,
        nowMs() - startedAtMs,
      )}`,
    );
  };

  return {
    dispatchTransition,
  };
};

export type NotificationDispatcher = ReturnType<typeof createNotificationDispatcher>;
