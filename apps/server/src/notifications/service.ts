import type {
  AgentMonitorConfig,
  NotificationSettings,
  NotificationSubscriptionRevokeJson,
} from "@vde-monitor/shared";
import webpush from "web-push";

import { createNotificationDispatcher, type NotificationDispatcher } from "./dispatcher";
import {
  createNotificationSubscriptionStore,
  type NotificationSubscriptionStore,
} from "./subscription-store";
import {
  REQUIRE_STANDALONE_ON_IOS,
  type SessionTransitionEvent,
  SUPPORTED_PUSH_EVENTS,
  type UpsertNotificationSubscriptionInput,
} from "./types";
import { createVapidStore, type VapidStore } from "./vapid-store";

type CreateNotificationServiceOptions = {
  config: AgentMonitorConfig;
  subscriptionStore?: NotificationSubscriptionStore;
  vapidStore?: VapidStore;
  dispatcher?: NotificationDispatcher;
};

export const createNotificationService = ({
  config,
  subscriptionStore = createNotificationSubscriptionStore(),
  vapidStore = createVapidStore(),
  dispatcher,
}: CreateNotificationServiceOptions) => {
  const vapidKeys = vapidStore.ensureKeys();
  webpush.setVapidDetails(vapidKeys.subject, vapidKeys.publicKey, vapidKeys.privateKey);

  const activeDispatcher =
    dispatcher ??
    createNotificationDispatcher({
      config,
      subscriptionStore,
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

  return {
    getSettings,
    upsertSubscription,
    removeSubscription,
    revokeSubscriptions,
    removeAllSubscriptions,
    dispatchTransition,
    getSupportedEvents,
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
