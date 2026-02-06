import type { SessionStateTimeline, SessionStateTimelineRange } from "@vde-monitor/shared";
import { useCallback, useEffect, useRef, useState } from "react";

import { API_ERROR_MESSAGES } from "@/lib/api-messages";
import { useVisibilityPolling } from "@/lib/use-visibility-polling";

type UseSessionTimelineParams = {
  paneId: string;
  connected: boolean;
  requestStateTimeline: (
    paneId: string,
    options?: { range?: SessionStateTimelineRange; limit?: number },
  ) => Promise<SessionStateTimeline>;
  mobileDefaultCollapsed: boolean;
};

type LoadTimelineOptions = {
  silent?: boolean;
};

const DEFAULT_RANGE: SessionStateTimelineRange = "1h";
const DEFAULT_LIMIT = 200;
const TIMELINE_POLL_INTERVAL_MS = 5000;

const resolveTimelineError = (err: unknown) =>
  err instanceof Error ? err.message : API_ERROR_MESSAGES.timeline;

export const useSessionTimeline = ({
  paneId,
  connected,
  requestStateTimeline,
  mobileDefaultCollapsed,
}: UseSessionTimelineParams) => {
  const [timeline, setTimeline] = useState<SessionStateTimeline | null>(null);
  const [timelineRange, setTimelineRange] = useState<SessionStateTimelineRange>(DEFAULT_RANGE);
  const [timelineError, setTimelineError] = useState<string | null>(null);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineExpanded, setTimelineExpanded] = useState(!mobileDefaultCollapsed);
  const previousConnectedRef = useRef<boolean | null>(null);

  const loadTimeline = useCallback(
    async ({ silent = false }: LoadTimelineOptions = {}) => {
      if (!paneId) {
        return;
      }
      if (!silent) {
        setTimelineLoading(true);
      }
      try {
        const nextTimeline = await requestStateTimeline(paneId, {
          range: timelineRange,
          limit: DEFAULT_LIMIT,
        });
        setTimeline(nextTimeline);
        setTimelineError(null);
      } catch (err) {
        setTimelineError(resolveTimelineError(err));
      } finally {
        if (!silent) {
          setTimelineLoading(false);
        }
      }
    },
    [paneId, requestStateTimeline, timelineRange],
  );

  useEffect(() => {
    void loadTimeline();
  }, [loadTimeline]);

  useEffect(() => {
    if (previousConnectedRef.current === false && connected) {
      void loadTimeline({ silent: true });
    }
    previousConnectedRef.current = connected;
  }, [connected, loadTimeline]);

  useEffect(() => {
    setTimeline(null);
    setTimelineError(null);
    setTimelineLoading(false);
    setTimelineExpanded(!mobileDefaultCollapsed);
  }, [mobileDefaultCollapsed, paneId]);

  const pollTimeline = useCallback(() => {
    void loadTimeline({ silent: true });
  }, [loadTimeline]);

  useVisibilityPolling({
    enabled: Boolean(paneId) && connected,
    intervalMs: TIMELINE_POLL_INTERVAL_MS,
    onTick: pollTimeline,
    onResume: pollTimeline,
  });

  const toggleTimelineExpanded = useCallback(() => {
    setTimelineExpanded((prev) => !prev);
  }, []);

  const refreshTimeline = useCallback(() => {
    void loadTimeline();
  }, [loadTimeline]);

  return {
    timeline,
    timelineRange,
    timelineError,
    timelineLoading,
    timelineExpanded,
    setTimelineRange,
    toggleTimelineExpanded,
    refreshTimeline,
  };
};
