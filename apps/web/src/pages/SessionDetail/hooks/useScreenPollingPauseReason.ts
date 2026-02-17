import { useDocumentVisibility, useNetwork, useWindowEvent } from "@mantine/hooks";
import { useCallback, useEffect, useState } from "react";

import { API_ERROR_MESSAGES } from "@/lib/api-messages";

type PollingPauseReason = "disconnected" | "unauthorized" | "offline" | "hidden" | null;

const resolvePollingPauseReason = ({
  connected,
  connectionIssue,
  isOffline,
  isHidden,
}: {
  connected: boolean;
  connectionIssue: string | null;
  isOffline: boolean;
  isHidden: boolean;
}): PollingPauseReason => {
  if (!connected) {
    return "disconnected";
  }
  if (connectionIssue === API_ERROR_MESSAGES.unauthorized) {
    return "unauthorized";
  }
  if (isOffline) {
    return "offline";
  }
  if (isHidden) {
    return "hidden";
  }
  return null;
};

export const useScreenPollingPauseReason = ({
  connected,
  connectionIssue,
}: {
  connected: boolean;
  connectionIssue: string | null;
}) => {
  const visibilityState = useDocumentVisibility();
  const { online } = useNetwork();
  const [pollingPauseReason, setPollingPauseReason] = useState<PollingPauseReason>(() =>
    resolvePollingPauseReason({
      connected,
      connectionIssue,
      isOffline: typeof navigator !== "undefined" && navigator.onLine === false,
      isHidden: typeof document !== "undefined" && document.hidden,
    }),
  );
  const updatePauseReason = useCallback(() => {
    const isOfflineNow =
      (typeof navigator !== "undefined" ? navigator.onLine === false : online === false) ||
      online === false;
    const isHiddenNow =
      typeof document !== "undefined" ? document.hidden : visibilityState !== "visible";
    setPollingPauseReason(
      resolvePollingPauseReason({
        connected,
        connectionIssue,
        isOffline: isOfflineNow,
        isHidden: isHiddenNow,
      }),
    );
  }, [connected, connectionIssue, online, visibilityState]);

  useWindowEvent("focus", updatePauseReason);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }
    document.addEventListener("visibilitychange", updatePauseReason);
    return () => {
      document.removeEventListener("visibilitychange", updatePauseReason);
    };
  }, [updatePauseReason]);

  useEffect(() => {
    updatePauseReason();
  }, [updatePauseReason]);

  return pollingPauseReason;
};
