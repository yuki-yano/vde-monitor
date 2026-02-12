import { useCallback, useEffect } from "react";

import { useVisibilityPolling } from "@/lib/use-visibility-polling";

const SESSION_POLL_INTERVAL_MS = 1000;

type UseSessionPollingArgs = {
  enabled: boolean;
  pollBackoffMs: number;
  refreshSessions: () => Promise<void>;
};

export const useSessionPolling = ({
  enabled,
  pollBackoffMs,
  refreshSessions,
}: UseSessionPollingArgs) => {
  const pollSessions = useCallback(() => {
    void refreshSessions();
  }, [refreshSessions]);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    void refreshSessions();
  }, [enabled, refreshSessions]);

  useVisibilityPolling({
    enabled,
    intervalMs: SESSION_POLL_INTERVAL_MS + pollBackoffMs,
    onTick: pollSessions,
    onResume: pollSessions,
  });
};
