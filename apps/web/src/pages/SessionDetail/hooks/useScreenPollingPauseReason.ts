import { useEffect, useState } from "react";

import { API_ERROR_MESSAGES } from "@/lib/api-messages";

export type PollingPauseReason = "disconnected" | "unauthorized" | "offline" | "hidden" | null;

const resolvePollingPauseReason = ({
  connected,
  connectionIssue,
}: {
  connected: boolean;
  connectionIssue: string | null;
}): PollingPauseReason => {
  if (!connected) {
    return "disconnected";
  }
  if (connectionIssue === API_ERROR_MESSAGES.unauthorized) {
    return "unauthorized";
  }
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return "offline";
  }
  if (typeof document !== "undefined" && document.hidden) {
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
  const [pollingPauseReason, setPollingPauseReason] = useState<PollingPauseReason>(() =>
    resolvePollingPauseReason({ connected, connectionIssue }),
  );

  useEffect(() => {
    setPollingPauseReason(resolvePollingPauseReason({ connected, connectionIssue }));
  }, [connected, connectionIssue]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const updatePauseReason = () => {
      setPollingPauseReason(resolvePollingPauseReason({ connected, connectionIssue }));
    };
    window.addEventListener("online", updatePauseReason);
    window.addEventListener("offline", updatePauseReason);
    window.addEventListener("visibilitychange", updatePauseReason);
    window.addEventListener("focus", updatePauseReason);
    return () => {
      window.removeEventListener("online", updatePauseReason);
      window.removeEventListener("offline", updatePauseReason);
      window.removeEventListener("visibilitychange", updatePauseReason);
      window.removeEventListener("focus", updatePauseReason);
    };
  }, [connected, connectionIssue]);

  return pollingPauseReason;
};
