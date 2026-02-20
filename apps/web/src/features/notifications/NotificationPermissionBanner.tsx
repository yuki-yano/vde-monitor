import { Bell, BellOff } from "lucide-react";

import { Button, Callout } from "@/components/ui";

import type { PushUiStatus } from "./use-push-notifications";

type NotificationPermissionBannerProps = {
  status: PushUiStatus;
  pushEnabled: boolean;
  isSubscribed: boolean;
  paneEnabled: boolean;
  errorMessage: string | null;
  onRequestPermission: () => void;
  onDisable: () => void;
};

const renderStatusMessage = (status: PushUiStatus, errorMessage: string | null) => {
  switch (status) {
    case "unsupported":
      return "This browser does not support Web Push.";
    case "insecure-context":
      return "Push notifications require HTTPS or localhost.";
    case "needs-ios-install":
      return "On iOS, add this app to Home Screen before enabling notifications.";
    case "requesting-permission":
      return "Waiting for notification permission...";
    case "subscribing":
      return "Registering push subscription...";
    case "denied":
      return "Notification permission is denied. Update browser settings to continue.";
    case "error":
      return errorMessage ?? "Failed to configure push notifications.";
    case "subscribed":
      return "Push notifications are enabled.";
    case "idle":
      return "Enable notifications to receive updates in the background.";
    default:
      return "Enable notifications.";
  }
};

export const NotificationPermissionBanner = ({
  status,
  pushEnabled,
  isSubscribed,
  paneEnabled,
  errorMessage,
  onRequestPermission,
  onDisable,
}: NotificationPermissionBannerProps) => {
  if (!pushEnabled) {
    return (
      <Callout tone="warning" size="xs">
        Push notifications are disabled by server configuration.
      </Callout>
    );
  }

  const showStatusMessage = paneEnabled;
  const message = showStatusMessage ? renderStatusMessage(status, errorMessage) : null;
  const canEnable = status === "idle" || status === "denied" || status === "error";
  const showDisable = isSubscribed || status === "subscribed";
  const hasControls = canEnable || showDisable;
  const tone = status === "error" || status === "denied" ? "error" : "warning";
  const isSteadySubscribed =
    status === "subscribed" && isSubscribed && paneEnabled && errorMessage == null;

  if (isSteadySubscribed) {
    return null;
  }

  if (!message && !hasControls) {
    return null;
  }

  return (
    <Callout tone={tone} size="xs">
      <div
        className={`flex flex-col gap-2 sm:flex-row sm:items-center ${
          message ? "sm:justify-between" : "sm:justify-end"
        }`}
      >
        {message && (
          <div className="flex items-start gap-2">
            <Bell className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{message}</span>
          </div>
        )}
        <div className="flex items-center gap-2">
          {canEnable && (
            <Button size="sm" variant="ghost" onClick={onRequestPermission}>
              <Bell className="h-3.5 w-3.5" />
              Enable
            </Button>
          )}
          {showDisable && (
            <Button size="sm" variant="ghost" onClick={onDisable}>
              <BellOff className="h-3.5 w-3.5" />
              Disable
            </Button>
          )}
        </div>
      </div>
    </Callout>
  );
};
