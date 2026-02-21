import { dedupeStrings, type NotificationSettings } from "@vde-monitor/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useSessions } from "@/state/session-context";

const DEVICE_ID_STORAGE_KEY = "vde-monitor-push-device-id";
const SUBSCRIPTION_ID_STORAGE_KEY = "vde-monitor-push-subscription-id";
const ENABLED_PANE_IDS_STORAGE_KEY = "vde-monitor-push-enabled-pane-ids";

export type PushUiStatus =
  | "unsupported"
  | "insecure-context"
  | "needs-ios-install"
  | "idle"
  | "requesting-permission"
  | "subscribing"
  | "subscribed"
  | "denied"
  | "error";

const areStringArraysEqual = (left: string[], right: string[]) =>
  left.length === right.length && left.every((value, index) => value === right[index]);

const isSameNotificationSettings = (
  left: NotificationSettings | null,
  right: NotificationSettings | null,
) => {
  if (left == null || right == null) {
    return left === right;
  }
  return (
    left.pushEnabled === right.pushEnabled &&
    left.vapidPublicKey === right.vapidPublicKey &&
    left.requireStandaloneOnIOS === right.requireStandaloneOnIOS &&
    areStringArraysEqual(left.supportedEvents, right.supportedEvents) &&
    areStringArraysEqual(left.enabledEventTypes, right.enabledEventTypes)
  );
};

const readEnabledPaneIds = () => {
  try {
    const raw = localStorage.getItem(ENABLED_PANE_IDS_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return dedupeStrings(parsed.filter((value): value is string => typeof value === "string"));
  } catch {
    return [];
  }
};

const writeEnabledPaneIds = (paneIds: string[]) => {
  localStorage.setItem(ENABLED_PANE_IDS_STORAGE_KEY, JSON.stringify(dedupeStrings(paneIds)));
};

const readOrCreateDeviceId = () => {
  const existing = localStorage.getItem(DEVICE_ID_STORAGE_KEY)?.trim();
  if (existing && existing.length > 0) {
    return existing;
  }
  const next =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `device-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  localStorage.setItem(DEVICE_ID_STORAGE_KEY, next);
  return next;
};

const isIOS = () => /iPhone|iPad|iPod/i.test(navigator.userAgent);

const isStandalone = () =>
  window.matchMedia?.("(display-mode: standalone)")?.matches === true ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

const resolvePlatform = (): "ios" | "android" | "desktop" | "unknown" => {
  const userAgent = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(userAgent)) {
    return "ios";
  }
  if (/Android/i.test(userAgent)) {
    return "android";
  }
  if (userAgent.trim().length > 0) {
    return "desktop";
  }
  return "unknown";
};

const canUsePushApi = () =>
  "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

const urlBase64ToUint8Array = (base64String: string) => {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
};

type UsePushNotificationsArgs = {
  paneId: string;
};

export const usePushNotifications = ({ paneId }: UsePushNotificationsArgs) => {
  const { token, apiBaseUrl, authError } = useSessions();
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [status, setStatus] = useState<PushUiStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [enabledPaneIds, setEnabledPaneIds] = useState<string[]>(() => readEnabledPaneIds());
  const subscriptionIdRef = useRef<string | null>(
    localStorage.getItem(SUBSCRIPTION_ID_STORAGE_KEY),
  );
  const [subscriptionId, setSubscriptionId] = useState<string | null>(
    () => subscriptionIdRef.current,
  );
  const [isSubscribed, setIsSubscribed] = useState(false);
  const deviceIdRef = useRef<string>(readOrCreateDeviceId());

  useEffect(() => {
    subscriptionIdRef.current = subscriptionId;
  }, [subscriptionId]);

  const apiBasePath = useMemo(() => {
    const normalized = apiBaseUrl?.trim();
    return normalized && normalized.length > 0 ? normalized : "/api";
  }, [apiBaseUrl]);

  const isPaneEnabled = enabledPaneIds.includes(paneId);
  const pushEnabled = settings?.pushEnabled ?? false;

  const upsertSubscription = useCallback(
    async (subscription: PushSubscription, paneIds: string[]) => {
      if (!token) {
        return;
      }
      const response = await fetch(`${apiBasePath}/notifications/subscriptions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          deviceId: deviceIdRef.current,
          subscription: subscription.toJSON(),
          scope: {
            paneIds,
          },
          client: {
            platform: resolvePlatform(),
            standalone: isStandalone(),
            userAgent: navigator.userAgent,
          },
        }),
      });
      if (!response.ok) {
        let message = `Failed to upsert subscription (${response.status})`;
        try {
          const payload = (await response.json()) as { error?: { message?: string } };
          if (payload.error?.message) {
            message = `${message}: ${payload.error.message}`;
          }
        } catch {
          // ignore
        }
        setErrorMessage(message);
        setStatus("error");
        return;
      }
      const data = (await response.json()) as { subscriptionId?: string };
      if (data.subscriptionId) {
        localStorage.setItem(SUBSCRIPTION_ID_STORAGE_KEY, data.subscriptionId);
        subscriptionIdRef.current = data.subscriptionId;
        setSubscriptionId(data.subscriptionId);
      }
      setErrorMessage(null);
      setStatus("subscribed");
      setIsSubscribed(true);
    },
    [apiBasePath, token],
  );

  const revokeServerSubscription = useCallback(
    async (endpoint: string | undefined) => {
      if (!token) {
        return;
      }
      const currentSubscriptionId =
        subscriptionIdRef.current ?? localStorage.getItem(SUBSCRIPTION_ID_STORAGE_KEY);
      if (currentSubscriptionId) {
        await fetch(
          `${apiBasePath}/notifications/subscriptions/${encodeURIComponent(currentSubscriptionId)}`,
          {
            method: "DELETE",
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        );
        return;
      }
      await fetch(`${apiBasePath}/notifications/subscriptions/revoke`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          deviceId: deviceIdRef.current,
          endpoint,
        }),
      });
    },
    [apiBasePath, token],
  );

  const disableNotifications = useCallback(async () => {
    if (!("serviceWorker" in navigator)) {
      localStorage.removeItem(SUBSCRIPTION_ID_STORAGE_KEY);
      subscriptionIdRef.current = null;
      setSubscriptionId(null);
      setIsSubscribed(false);
      setStatus("idle");
      return;
    }
    try {
      const registration = await navigator.serviceWorker.ready;
      const current = await registration.pushManager.getSubscription();
      try {
        await revokeServerSubscription(current?.endpoint);
      } catch {
        // best-effort server revoke
      }
      await current?.unsubscribe();
    } catch {
      // continue local cleanup
    } finally {
      localStorage.removeItem(SUBSCRIPTION_ID_STORAGE_KEY);
      subscriptionIdRef.current = null;
      setSubscriptionId(null);
      setIsSubscribed(false);
      setStatus("idle");
    }
  }, [revokeServerSubscription]);

  const syncCurrentSubscription = useCallback(
    async (paneIds: string[]) => {
      if (!("serviceWorker" in navigator)) {
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const current = await registration.pushManager.getSubscription();
      if (!current) {
        setIsSubscribed(false);
        setStatus("idle");
        return;
      }
      await upsertSubscription(current, paneIds);
    },
    [upsertSubscription],
  );

  const requestPermissionAndSubscribe = useCallback(async () => {
    if (!token || settings == null || authError != null) {
      return;
    }
    if (!settings.pushEnabled) {
      setStatus("idle");
      return;
    }
    if (!window.isSecureContext) {
      setStatus("insecure-context");
      return;
    }
    if (!canUsePushApi()) {
      setStatus("unsupported");
      return;
    }
    if (isIOS() && settings.requireStandaloneOnIOS && !isStandalone()) {
      setStatus("needs-ios-install");
      return;
    }

    try {
      setStatus("requesting-permission");
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(permission === "denied" ? "denied" : "idle");
        return;
      }

      setStatus("subscribing");
      const registration = await navigator.serviceWorker.ready;
      let current = await registration.pushManager.getSubscription();
      if (!current) {
        current = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(settings.vapidPublicKey),
        });
      }
      await upsertSubscription(current, enabledPaneIds);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to subscribe push notification";
      setErrorMessage(message);
      setStatus("error");
    }
  }, [authError, enabledPaneIds, settings, token, upsertSubscription]);

  const togglePaneEnabled = useCallback(async () => {
    const nextPaneIds = isPaneEnabled
      ? enabledPaneIds.filter((id) => id !== paneId)
      : dedupeStrings([...enabledPaneIds, paneId]);
    setEnabledPaneIds(nextPaneIds);
    writeEnabledPaneIds(nextPaneIds);
    if (isSubscribed && settings?.pushEnabled) {
      await syncCurrentSubscription(nextPaneIds);
    }
  }, [
    enabledPaneIds,
    isPaneEnabled,
    isSubscribed,
    paneId,
    settings?.pushEnabled,
    syncCurrentSubscription,
  ]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!token || authError != null) {
        if (!cancelled) {
          setSettings(null);
          setStatus("idle");
          setIsSubscribed(false);
        }
        return;
      }
      if (!window.isSecureContext) {
        if (!cancelled) {
          setStatus("insecure-context");
          setIsSubscribed(false);
        }
        return;
      }
      if (!canUsePushApi()) {
        if (!cancelled) {
          setStatus("unsupported");
          setIsSubscribed(false);
        }
        return;
      }

      try {
        const response = await fetch(`${apiBasePath}/notifications/settings`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        if (!response.ok) {
          if (!cancelled) {
            setErrorMessage(`Failed to load push settings (${response.status})`);
            setStatus("error");
          }
          return;
        }
        const data = (await response.json()) as { settings?: NotificationSettings };
        const nextSettings = data.settings ?? null;
        if (!nextSettings) {
          if (!cancelled) {
            setErrorMessage("Invalid push settings response");
            setStatus("error");
          }
          return;
        }
        if (cancelled) {
          return;
        }
        setSettings((prev) =>
          isSameNotificationSettings(prev, nextSettings) ? prev : nextSettings,
        );
        if (isIOS() && nextSettings.requireStandaloneOnIOS && !isStandalone()) {
          setStatus("needs-ios-install");
          return;
        }
        if (Notification.permission === "denied") {
          setStatus("denied");
          return;
        }

        const registration = await navigator.serviceWorker.ready;
        const current = await registration.pushManager.getSubscription();
        if (!nextSettings.pushEnabled) {
          if (current) {
            await disableNotifications();
          } else {
            setStatus("idle");
            setIsSubscribed(false);
          }
          return;
        }
        if (current) {
          setIsSubscribed(true);
          setStatus("subscribed");
          await upsertSubscription(current, readEnabledPaneIds());
          return;
        }
        setIsSubscribed(false);
        setStatus("idle");
      } catch (error) {
        if (cancelled) {
          return;
        }
        const message =
          error instanceof Error ? error.message : "Failed to initialize push notifications";
        setErrorMessage(message);
        setStatus("error");
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [apiBasePath, authError, disableNotifications, token, upsertSubscription]);

  return {
    status,
    pushEnabled,
    isSubscribed,
    isPaneEnabled,
    errorMessage,
    requestPermissionAndSubscribe,
    disableNotifications,
    togglePaneEnabled,
  };
};
