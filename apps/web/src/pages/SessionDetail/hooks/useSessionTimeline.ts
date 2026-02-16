import type {
  SessionStateTimeline,
  SessionStateTimelineRange,
  SessionStateTimelineScope,
} from "@vde-monitor/shared";
import { useCallback, useEffect, useRef, useState } from "react";

import { API_ERROR_MESSAGES } from "@/lib/api-messages";
import { resolveUnknownErrorMessage } from "@/lib/api-utils";
import { useVisibilityPolling } from "@/lib/use-visibility-polling";

import { createNextRequestId, isCurrentPaneRequest } from "./session-request-guard";

type UseSessionTimelineParams = {
  paneId: string;
  connected: boolean;
  requestStateTimeline: (
    paneId: string,
    options?: {
      scope?: SessionStateTimelineScope;
      range?: SessionStateTimelineRange;
      limit?: number;
    },
  ) => Promise<SessionStateTimeline>;
  hasRepoTimeline: boolean;
  mobileDefaultCollapsed: boolean;
};

type LoadTimelineOptions = {
  silent?: boolean;
};

const DEFAULT_RANGE: SessionStateTimelineRange = "1h";
const DEFAULT_SCOPE: SessionStateTimelineScope = "pane";
const TIMELINE_POLL_INTERVAL_MS = 5000;

const resolveTimelineError = (err: unknown) =>
  resolveUnknownErrorMessage(err, API_ERROR_MESSAGES.timeline);

export const useSessionTimeline = ({
  paneId,
  connected,
  requestStateTimeline,
  hasRepoTimeline,
  mobileDefaultCollapsed,
}: UseSessionTimelineParams) => {
  const [timeline, setTimeline] = useState<SessionStateTimeline | null>(null);
  const [timelineScope, setTimelineScope] = useState<SessionStateTimelineScope>(DEFAULT_SCOPE);
  const [timelineRange, setTimelineRange] = useState<SessionStateTimelineRange>(DEFAULT_RANGE);
  const [timelineError, setTimelineError] = useState<string | null>(null);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineExpanded, setTimelineExpanded] = useState(!mobileDefaultCollapsed);
  const previousConnectedRef = useRef<boolean | null>(null);
  const activePaneIdRef = useRef(paneId);
  const timelineRequestIdRef = useRef(0);
  const pendingInteractiveLoadsRef = useRef(0);
  activePaneIdRef.current = paneId;

  const loadTimeline = useCallback(
    async ({ silent = false }: LoadTimelineOptions = {}) => {
      if (!paneId) {
        return;
      }
      const targetPaneId = paneId;
      const requestId = createNextRequestId(timelineRequestIdRef);
      if (!silent) {
        pendingInteractiveLoadsRef.current += 1;
        setTimelineLoading(true);
      }
      try {
        const requestedScope =
          timelineScope === "repo" && hasRepoTimeline ? ("repo" as const) : undefined;
        const nextTimeline = await requestStateTimeline(targetPaneId, {
          scope: requestedScope,
          range: timelineRange,
        });
        if (
          !isCurrentPaneRequest({
            requestIdRef: timelineRequestIdRef,
            requestId,
            activePaneIdRef,
            paneId: targetPaneId,
          })
        ) {
          return;
        }
        setTimeline(nextTimeline);
        setTimelineError(null);
      } catch (err) {
        if (
          !isCurrentPaneRequest({
            requestIdRef: timelineRequestIdRef,
            requestId,
            activePaneIdRef,
            paneId: targetPaneId,
          })
        ) {
          return;
        }
        setTimelineError(resolveTimelineError(err));
      } finally {
        if (!silent) {
          pendingInteractiveLoadsRef.current = Math.max(0, pendingInteractiveLoadsRef.current - 1);
          if (
            activePaneIdRef.current === targetPaneId &&
            pendingInteractiveLoadsRef.current === 0
          ) {
            setTimelineLoading(false);
          }
        }
      }
    },
    [hasRepoTimeline, paneId, requestStateTimeline, timelineRange, timelineScope],
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
    pendingInteractiveLoadsRef.current = 0;
    setTimeline(null);
    setTimelineError(null);
    setTimelineLoading(false);
    setTimelineExpanded(!mobileDefaultCollapsed);
    setTimelineScope(DEFAULT_SCOPE);
  }, [mobileDefaultCollapsed, paneId]);

  useEffect(() => {
    if (!hasRepoTimeline && timelineScope === "repo") {
      setTimelineScope(DEFAULT_SCOPE);
    }
  }, [hasRepoTimeline, timelineScope]);

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
    timelineScope,
    timelineRange,
    hasRepoTimeline,
    timelineError,
    timelineLoading,
    timelineExpanded,
    setTimelineScope,
    setTimelineRange,
    toggleTimelineExpanded,
    refreshTimeline,
  };
};
