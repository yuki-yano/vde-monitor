import { useEffect, useReducer } from "react";

import { API_ERROR_MESSAGES } from "@/lib/api-messages";

type PollingPauseReason = "disconnected" | "unauthorized" | "offline" | "hidden" | null;

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
  const [, bumpBrowserStateVersion] = useReducer((version: number) => {
    return version + 1;
  }, 0);
  const pollingPauseReason = resolvePollingPauseReason({ connected, connectionIssue });

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const targetDocument = typeof document !== "undefined" ? document : null;
    const updatePauseReason = () => bumpBrowserStateVersion();
    window.addEventListener("online", updatePauseReason);
    window.addEventListener("offline", updatePauseReason);
    targetDocument?.addEventListener("visibilitychange", updatePauseReason);
    window.addEventListener("focus", updatePauseReason);
    return () => {
      window.removeEventListener("online", updatePauseReason);
      window.removeEventListener("offline", updatePauseReason);
      targetDocument?.removeEventListener("visibilitychange", updatePauseReason);
      window.removeEventListener("focus", updatePauseReason);
    };
  }, []);

  return pollingPauseReason;
};
