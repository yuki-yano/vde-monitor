import type {
  AgentMonitorConfig,
  NotificationSettings,
  NotificationSubscriptionRevokeJson,
  SessionDetail,
  SummaryPublishLocator,
  SummaryPublishRequest,
} from "@vde-monitor/shared";
import webpush from "web-push";

import { type NotificationDispatcher, createNotificationDispatcher } from "./dispatcher";
import { type SummaryBus, createSummaryBus } from "./summary-bus";
import {
  type NotificationSubscriptionStore,
  createNotificationSubscriptionStore,
} from "./subscription-store";
import {
  REQUIRE_STANDALONE_ON_IOS,
  SUPPORTED_PUSH_EVENTS,
  type SessionTransitionEvent,
  type UpsertNotificationSubscriptionInput,
} from "./types";
import { type VapidStore, createVapidStore } from "./vapid-store";

type CreateNotificationServiceOptions = {
  config: AgentMonitorConfig;
  subscriptionStore?: NotificationSubscriptionStore;
  vapidStore?: VapidStore;
  dispatcher?: NotificationDispatcher;
  summaryBus?: SummaryBus;
};

type SummarySessionDetailResolver = (paneId: string) => SessionDetail | null;

export const createNotificationService = ({
  config,
  subscriptionStore = createNotificationSubscriptionStore(),
  vapidStore = createVapidStore(),
  dispatcher,
  summaryBus,
}: CreateNotificationServiceOptions) => {
  const vapidKeys = vapidStore.ensureKeys();
  webpush.setVapidDetails(vapidKeys.subject, vapidKeys.publicKey, vapidKeys.privateKey);
  const activeSummaryBus = summaryBus ?? createSummaryBus();
  let summarySessionDetailResolver: SummarySessionDetailResolver | null = null;

  const activeDispatcher =
    dispatcher ??
    createNotificationDispatcher({
      config,
      subscriptionStore,
      summaryBus: activeSummaryBus,
    });

  const getSettings = (): NotificationSettings => ({
    pushEnabled: config.notifications.pushEnabled,
    vapidPublicKey: vapidKeys.publicKey,
    supportedEvents: [...SUPPORTED_PUSH_EVENTS],
    enabledEventTypes: [...config.notifications.enabledEventTypes],
    requireStandaloneOnIOS: REQUIRE_STANDALONE_ON_IOS,
  });

  const upsertSubscription = (input: UpsertNotificationSubscriptionInput) => {
    if (!config.notifications.pushEnabled) {
      throw new Error("PUSH_DISABLED");
    }
    const result = subscriptionStore.upsert(input);
    return {
      subscriptionId: result.subscription.id,
      created: result.created,
      savedAt: result.savedAt,
    };
  };

  const removeSubscription = (subscriptionId: string) => {
    return subscriptionStore.removeById(subscriptionId);
  };

  const revokeSubscriptions = (input: NotificationSubscriptionRevokeJson) => {
    return subscriptionStore.revoke({
      subscriptionId: input.subscriptionId,
      endpoint: input.endpoint,
      deviceId: input.deviceId,
    });
  };

  const removeAllSubscriptions = () => {
    return subscriptionStore.removeAll();
  };

  const dispatchTransition = async (event: SessionTransitionEvent) => {
    await activeDispatcher.dispatchTransition(event);
  };

  const getSupportedEvents = () => [...SUPPORTED_PUSH_EVENTS];

  const publishSummaryEvent = (request: SummaryPublishRequest) => {
    return activeSummaryBus.publish(request);
  };

  const setSummarySessionDetailResolver = (resolver: SummarySessionDetailResolver) => {
    summarySessionDetailResolver = resolver;
  };

  const resolveExpectedRunId = (locator: SummaryPublishLocator, detail: SessionDetail) => {
    if (locator.source === "claude") {
      const sessionId = detail.agentSessionId?.trim();
      if (sessionId && sessionId.length > 0) {
        return sessionId;
      }
      return detail.paneId;
    }
    return detail.paneId;
  };

  const validateSummaryLocator = (locator: SummaryPublishLocator) => {
    if (!summarySessionDetailResolver) {
      return {
        ok: false as const,
        status: 400 as const,
        code: "invalid_request" as const,
        message: "summary locator resolver is unavailable",
      };
    }
    const detail = summarySessionDetailResolver(locator.paneId);
    if (!detail) {
      return {
        ok: false as const,
        status: 400 as const,
        code: "invalid_request" as const,
        message: "pane not found for summary locator",
      };
    }
    if (detail.agent !== locator.source) {
      return {
        ok: false as const,
        status: 403 as const,
        code: "forbidden_binding" as const,
        message: "source does not match pane binding",
      };
    }
    const expectedRunId = resolveExpectedRunId(locator, detail);
    if (expectedRunId !== locator.runId) {
      return {
        ok: false as const,
        status: 403 as const,
        code: "forbidden_binding" as const,
        message: "runId does not match pane binding",
      };
    }
    return {
      ok: true as const,
    };
  };

  return {
    getSettings,
    upsertSubscription,
    removeSubscription,
    revokeSubscriptions,
    removeAllSubscriptions,
    dispatchTransition,
    getSupportedEvents,
    publishSummaryEvent,
    setSummarySessionDetailResolver,
    validateSummaryLocator,
  };
};

export type NotificationService = ReturnType<typeof createNotificationService>;

/**
 * CLI utility for token-rotation flows.
 * This creates an isolated store instance and mutates the persisted subscription file directly.
 * Running service processes keep their own in-memory state and are not synchronized by this call.
 */
export const removeAllNotificationSubscriptions = () => {
  const store = createNotificationSubscriptionStore();
  return store.removeAll();
};
