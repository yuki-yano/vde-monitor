import type {
  NotificationClientInfo,
  PushEventType,
  PushSubscriptionJson,
  SessionDetail,
} from "@vde-monitor/shared";

export const SUPPORTED_PUSH_EVENTS = ["pane.waiting_permission", "pane.task_completed"] as const;
export const REQUIRE_STANDALONE_ON_IOS = true;

export type SupportedPushEvent = (typeof SUPPORTED_PUSH_EVENTS)[number];

export type SessionTransitionEvent = {
  paneId: string;
  previous: SessionDetail | null;
  next: SessionDetail;
  at: string;
  source: "poll" | "hook" | "restore";
};

export type NotificationSubscriptionRecord = {
  id: string;
  deviceId: string;
  endpoint: string;
  expirationTime: number | null;
  keys: {
    p256dh: string;
    auth: string;
  };
  paneIds: string[];
  eventTypes: PushEventType[] | null;
  platform: "ios" | "android" | "desktop" | "unknown";
  standalone: boolean;
  userAgent: string | null;
  createdAt: string;
  updatedAt: string;
  lastDeliveredAt: string | null;
  lastDeliveryError: string | null;
};

export type PersistedNotifications = {
  version: 1;
  savedAt: string;
  subscriptions: NotificationSubscriptionRecord[];
};

export type UpsertNotificationSubscriptionInput = {
  deviceId: string;
  subscription: PushSubscriptionJson;
  scope: {
    paneIds: string[];
    eventTypes: PushEventType[] | null;
  };
  client?: NotificationClientInfo;
};

export type UpsertNotificationSubscriptionResult = {
  subscriptionId: string;
  created: boolean;
  savedAt: string;
};

export type NotificationPayload = {
  version: 1;
  type: "session.state.changed";
  eventType: PushEventType;
  paneId: string;
  sessionName: string;
  title: string;
  body: string;
  url: string;
  tag: string;
  ts: string;
  summary?: {
    summaryId: string;
    sourceAgent: "codex" | "claude";
    paneTitle: string;
    notificationTitle: string;
    notificationBody: string;
  };
};
