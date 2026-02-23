import type {
  SessionStateTimelineRange,
  UsageDashboardResponse,
  UsageGlobalTimelineResponse,
  UsageProviderSnapshot,
} from "@vde-monitor/shared";
import { useCallback, useEffect, useRef, useState } from "react";

import { API_ERROR_MESSAGES } from "@/lib/api-messages";
import { useNowMs } from "@/lib/use-now-ms";
import { useVisibilityPolling } from "@/lib/use-visibility-polling";
import { useSessions } from "@/state/session-context";
import { useUsageApi } from "@/state/use-usage-api";

const DASHBOARD_POLL_INTERVAL_MS = 30_000;
const BILLING_POLL_INTERVAL_MS = 180_000;
const TIMELINE_POLL_INTERVAL_MS = 15_000;
const TIMELINE_DEFAULT_RANGE: SessionStateTimelineRange = "24h";

const hasBillingData = (provider: UsageProviderSnapshot) =>
  provider.billing.costTodayUsd != null ||
  provider.billing.costTodayTokens != null ||
  provider.billing.costLast30DaysUsd != null ||
  provider.billing.costLast30DaysTokens != null ||
  provider.billing.modelBreakdown.length > 0 ||
  provider.billing.dailyBreakdown.length > 0 ||
  provider.billing.meta.source !== "unavailable" ||
  provider.billing.meta.sourceLabel != null ||
  provider.billing.meta.updatedAt != null ||
  provider.billing.meta.reasonCode != null ||
  provider.billing.meta.reasonMessage != null ||
  provider.billing.meta.confidence != null;

const mergeDashboardWithPreviousBilling = (
  next: UsageDashboardResponse,
  previous: UsageDashboardResponse | null,
): UsageDashboardResponse => {
  if (!previous) {
    return next;
  }
  const previousByProviderId = new Map(
    previous.providers.map((provider) => [provider.providerId, provider]),
  );
  return {
    ...next,
    providers: next.providers.map((provider) => {
      const previousProvider = previousByProviderId.get(provider.providerId);
      if (!previousProvider || hasBillingData(provider) || !hasBillingData(previousProvider)) {
        return provider;
      }
      return {
        ...provider,
        billing: previousProvider.billing,
        capabilities: {
          ...provider.capabilities,
          cost: provider.capabilities.cost || previousProvider.capabilities.cost,
        },
      };
    }),
  };
};

export const useUsageDashboardVM = () => {
  const { token, apiBaseUrl } = useSessions();
  const { requestUsageDashboard, requestUsageGlobalTimeline, resolveErrorMessage } = useUsageApi({
    token,
    apiBaseUrl,
  });

  const [dashboard, setDashboard] = useState<UsageDashboardResponse | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<UsageGlobalTimelineResponse | null>(null);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineError, setTimelineError] = useState<string | null>(null);
  const [timelineRange, setTimelineRange] =
    useState<SessionStateTimelineRange>(TIMELINE_DEFAULT_RANGE);
  const [compactTimeline, setCompactTimeline] = useState(true);
  const dashboardRequestIdRef = useRef(0);
  const timelineRequestIdRef = useRef(0);
  const timelineRangeRef = useRef<SessionStateTimelineRange>(TIMELINE_DEFAULT_RANGE);
  const nowMs = useNowMs(30_000);

  const canRequest = Boolean(token);

  const loadDashboard = useCallback(
    async ({
      forceRefresh = false,
      silent = false,
      includeCost = true,
      preserveBilling = false,
    }: {
      forceRefresh?: boolean;
      silent?: boolean;
      includeCost?: boolean;
      preserveBilling?: boolean;
    } = {}) => {
      const requestId = ++dashboardRequestIdRef.current;
      if (!canRequest) {
        setDashboard(null);
        setDashboardError(API_ERROR_MESSAGES.missingToken);
        return;
      }
      if (!silent) {
        setDashboardLoading(true);
      }
      try {
        if (silent) {
          const next = await requestUsageDashboard({
            refresh: forceRefresh,
            includeCost,
          });
          if (requestId !== dashboardRequestIdRef.current) {
            return;
          }
          setDashboard((current) =>
            preserveBilling ? mergeDashboardWithPreviousBilling(next, current) : next,
          );
          setDashboardError(null);
          return;
        }

        const warmup = await requestUsageDashboard({
          refresh: forceRefresh,
          includeCost: false,
        });
        if (requestId !== dashboardRequestIdRef.current) {
          return;
        }
        setDashboard((current) => mergeDashboardWithPreviousBilling(warmup, current));
        setDashboardError(null);

        try {
          const withCost = await requestUsageDashboard({
            includeCost: true,
          });
          if (requestId !== dashboardRequestIdRef.current) {
            return;
          }
          setDashboard(withCost);
          setDashboardError(null);
        } catch {
          if (requestId !== dashboardRequestIdRef.current) {
            return;
          }
          // Keep fast usage windows result when cost enrichment fails.
        }
      } catch (error) {
        if (requestId !== dashboardRequestIdRef.current) {
          return;
        }
        setDashboardError(resolveErrorMessage(error, API_ERROR_MESSAGES.usageDashboard));
      } finally {
        if (!silent && requestId === dashboardRequestIdRef.current) {
          setDashboardLoading(false);
        }
      }
    },
    [canRequest, requestUsageDashboard, resolveErrorMessage],
  );

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
        const next = await requestUsageGlobalTimeline({
          range: nextRange,
        });
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

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    timelineRangeRef.current = timelineRange;
  }, [timelineRange]);

  useEffect(() => {
    void loadTimeline({ range: timelineRange });
  }, [loadTimeline, timelineRange]);

  useEffect(() => {
    if (timelineRange === "3d" || timelineRange === "7d") {
      setCompactTimeline(true);
    }
  }, [timelineRange]);

  useVisibilityPolling({
    enabled: canRequest,
    intervalMs: DASHBOARD_POLL_INTERVAL_MS,
    onTick: () => {
      void loadDashboard({
        silent: true,
        includeCost: false,
        preserveBilling: true,
      });
    },
    onResume: () => {
      void loadDashboard({
        silent: true,
        includeCost: false,
        preserveBilling: true,
      });
    },
  });

  useVisibilityPolling({
    enabled: canRequest,
    intervalMs: BILLING_POLL_INTERVAL_MS,
    onTick: () => {
      void loadDashboard({ silent: true, includeCost: true });
    },
  });

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

  const refreshAll = useCallback(() => {
    void Promise.all([
      loadDashboard({ forceRefresh: true }),
      loadTimeline({ range: timelineRange }),
    ]);
  }, [loadDashboard, loadTimeline, timelineRange]);

  return {
    dashboard,
    dashboardLoading,
    dashboardError,
    timeline,
    timelineLoading,
    timelineError,
    timelineRange,
    compactTimeline,
    nowMs,
    onTimelineRangeChange: setTimelineRange,
    onToggleCompactTimeline: () => {
      setCompactTimeline((current) => !current);
    },
    onRefreshAll: refreshAll,
  };
};

export type UsageDashboardVM = ReturnType<typeof useUsageDashboardVM>;
