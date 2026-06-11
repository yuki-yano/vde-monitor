import type { SessionStateTimelineRange, UsageGlobalTimelineResponse } from "@vde-monitor/shared";
import { useCallback, useEffect, useRef, useState } from "react";

import { API_ERROR_MESSAGES } from "@/lib/api-messages";
import { useVisibilityPolling } from "@/lib/use-visibility-polling";

const TIMELINE_POLL_INTERVAL_MS = 15_000;
const TIMELINE_DEFAULT_RANGE: SessionStateTimelineRange = "24h";

type RequestUsageGlobalTimeline = (options: {
  range?: SessionStateTimelineRange;
}) => Promise<UsageGlobalTimelineResponse>;

type ResolveErrorMessage = (error: unknown, fallback: string) => string;

export const useUsageTimelineData = ({
  canRequest,
  requestUsageGlobalTimeline,
  resolveErrorMessage,
}: {
  canRequest: boolean;
  requestUsageGlobalTimeline: RequestUsageGlobalTimeline;
  resolveErrorMessage: ResolveErrorMessage;
}) => {
  const [timeline, setTimeline] = useState<UsageGlobalTimelineResponse | null>(null);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineError, setTimelineError] = useState<string | null>(null);
  const [timelineRange, setTimelineRange] =
    useState<SessionStateTimelineRange>(TIMELINE_DEFAULT_RANGE);
  const [compactTimeline, setCompactTimeline] = useState(true);
  const timelineRequestIdRef = useRef(0);
  // Ref mirror of timelineRange so that polling ticks always read the current value
  // without becoming stale dependencies of the polling callbacks.
  const timelineRangeRef = useRef<SessionStateTimelineRange>(TIMELINE_DEFAULT_RANGE);

  const loadTimeline = useCallback(
    async ({
      silent = false,
      range,
    }: {
      silent?: boolean;
      range?: SessionStateTimelineRange;
    } = {}) => {
      const requestId = ++timelineRequestIdRef.current;
      if (!canRequest) {
        setTimeline(null);
        setTimelineError(API_ERROR_MESSAGES.missingToken);
        return;
      }
      const nextRange = range ?? timelineRangeRef.current;
      if (!silent) {
        setTimelineLoading(true);
      }
      try {
        const next = await requestUsageGlobalTimeline({ range: nextRange });
        if (requestId !== timelineRequestIdRef.current) {
          return;
        }
        setTimeline(next);
        setTimelineError(null);
      } catch (error) {
        if (requestId !== timelineRequestIdRef.current) {
          return;
        }
        setTimelineError(resolveErrorMessage(error, API_ERROR_MESSAGES.usageGlobalTimeline));
      } finally {
        if (!silent && requestId === timelineRequestIdRef.current) {
          setTimelineLoading(false);
        }
      }
    },
    [canRequest, requestUsageGlobalTimeline, resolveErrorMessage],
  );

  // Keep the ref in sync so that polling callbacks always read the latest range.
  useEffect(() => {
    timelineRangeRef.current = timelineRange;
  }, [timelineRange]);

  // Reload whenever the user switches range.
  useEffect(() => {
    void loadTimeline({ range: timelineRange });
  }, [loadTimeline, timelineRange]);

  // Switch to compact view automatically for multi-day ranges.
  useEffect(() => {
    if (
      timelineRange === "3d" ||
      timelineRange === "7d" ||
      timelineRange === "14d" ||
      timelineRange === "30d"
    ) {
      setCompactTimeline(true);
    }
  }, [timelineRange]);

  useVisibilityPolling({
    enabled: canRequest,
    intervalMs: TIMELINE_POLL_INTERVAL_MS,
    onTick: () => {
      void loadTimeline({ silent: true });
    },
    onResume: () => {
      void loadTimeline({ silent: true });
    },
  });

  return {
    timeline,
    timelineLoading,
    timelineError,
    timelineRange,
    setTimelineRange,
    compactTimeline,
    setCompactTimeline,
    loadTimeline,
  };
};
