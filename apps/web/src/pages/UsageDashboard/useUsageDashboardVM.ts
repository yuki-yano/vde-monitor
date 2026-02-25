import { useNavigate } from "@tanstack/react-router";
import type {
  SessionStateTimelineRange,
  UsageDashboardResponse,
  UsageGlobalTimelineResponse,
  UsageIssue,
} from "@vde-monitor/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useWorkspaceTabs } from "@/features/pwa-tabs/context/workspace-tabs-context";
import { useSessionListPins } from "@/features/shared-session-ui/hooks/useSessionListPins";
import { useSessionLogs } from "@/features/shared-session-ui/hooks/useSessionLogs";
import { API_ERROR_MESSAGES } from "@/lib/api-messages";
import { buildSessionGroups } from "@/lib/session-group";
import { useNowMs } from "@/lib/use-now-ms";
import { useSidebarWidth } from "@/lib/use-sidebar-width";
import { useVisibilityPolling } from "@/lib/use-visibility-polling";
import type { LaunchAgentRequestOptions } from "@/state/launch-agent-options";
import { useSessions } from "@/state/session-context";
import { useTheme } from "@/state/theme-context";
import { useUsageApi } from "@/state/use-usage-api";

const DASHBOARD_POLL_INTERVAL_MS = 30_000;
const BILLING_POLL_INTERVAL_MS = 180_000;
const TIMELINE_POLL_INTERVAL_MS = 15_000;
const TIMELINE_DEFAULT_RANGE: SessionStateTimelineRange = "24h";
type BillingProviderId = "codex" | "claude";
const FALLBACK_BILLING_PROVIDERS: BillingProviderId[] = ["codex", "claude"];

const createLaunchRequestId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `launch-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

const isBillingProviderId = (providerId: string): providerId is BillingProviderId =>
  providerId === "codex" || providerId === "claude";

const mergeIssues = (current: UsageIssue[], next: UsageIssue[]): UsageIssue[] => {
  if (next.length === 0) {
    return current;
  }
  const merged = [...current];
  for (const issue of next) {
    if (!merged.some((item) => item.code === issue.code && item.message === issue.message)) {
      merged.push(issue);
    }
  }
  return merged;
};

const mergeDashboardCore = (
  current: UsageDashboardResponse | null,
  next: UsageDashboardResponse,
): UsageDashboardResponse => {
  if (!current) {
    return next;
  }
  const currentByProvider = new Map(
    current.providers.map((provider) => [provider.providerId, provider] as const),
  );
  return {
    ...next,
    providers: next.providers.map((provider) => {
      const existing = currentByProvider.get(provider.providerId);
      if (!existing) {
        return provider;
      }
      return {
        ...provider,
        billing: existing.billing,
        capabilities: {
          ...provider.capabilities,
          cost: existing.capabilities.cost,
        },
        issues: mergeIssues(provider.issues, existing.issues),
      };
    }),
  };
};

export const useUsageDashboardVM = () => {
  const {
    token,
    apiBaseUrl,
    sessions,
    connected,
    connectionIssue,
    launchConfig,
    requestWorktrees,
    requestStateTimeline,
    requestScreen,
    launchAgentInSession,
    touchSession,
    highlightCorrections,
  } = useSessions();
  const navigate = useNavigate();
  const { enabled: pwaTabsEnabled, openSessionTab } = useWorkspaceTabs();
  const { resolvedTheme } = useTheme();
  const { sidebarWidth, handlePointerDown } = useSidebarWidth();
  const { getRepoSortAnchorAt, touchRepoPin, touchPanePin } = useSessionListPins({
    sessions,
    onTouchPane: touchSession,
  });
  const {
    requestUsageDashboard,
    requestUsageProviderBilling,
    requestUsageGlobalTimeline,
    resolveErrorMessage,
  } = useUsageApi({ token, apiBaseUrl });

  const [dashboard, setDashboard] = useState<UsageDashboardResponse | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<UsageGlobalTimelineResponse | null>(null);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineError, setTimelineError] = useState<string | null>(null);
  const [timelineRange, setTimelineRange] =
    useState<SessionStateTimelineRange>(TIMELINE_DEFAULT_RANGE);
  const [compactTimeline, setCompactTimeline] = useState(true);
  const [billingLoadingByProvider, setBillingLoadingByProvider] = useState<
    Record<BillingProviderId, boolean>
  >({
    codex: false,
    claude: false,
  });
  const dashboardRequestIdRef = useRef(0);
  const initialBillingRequestedRef = useRef(false);
  const billingRequestIdRef = useRef<Record<BillingProviderId, number>>({
    codex: 0,
    claude: 0,
  });
  const dashboardBillingProvidersRef = useRef<BillingProviderId[]>(FALLBACK_BILLING_PROVIDERS);
  const timelineRequestIdRef = useRef(0);
  const timelineRangeRef = useRef<SessionStateTimelineRange>(TIMELINE_DEFAULT_RANGE);
  const nowMs = useNowMs(30_000);

  const canRequest = Boolean(token);
  const sidebarSessionGroups = useMemo(
    () =>
      buildSessionGroups(sessions, {
        getRepoSortAnchorAt,
      }),
    [getRepoSortAnchorAt, sessions],
  );
  const quickPanelGroups = sidebarSessionGroups;
  const {
    quickPanelOpen,
    logModalOpen,
    selectedPaneId,
    selectedSession,
    selectedLogLines,
    selectedLogLoading,
    selectedLogError,
    openLogModal,
    closeLogModal,
    toggleQuickPanel,
    closeQuickPanel,
  } = useSessionLogs({
    connected,
    connectionIssue,
    sessions,
    requestScreen,
    resolvedTheme,
    highlightCorrections,
  });

  const loadProviderBilling = useCallback(
    async ({
      provider,
      forceRefresh = false,
    }: {
      provider: BillingProviderId;
      forceRefresh?: boolean;
    }) => {
      const requestId = ++billingRequestIdRef.current[provider];
      if (!canRequest) {
        return;
      }
      setBillingLoadingByProvider((current) => ({
        ...current,
        [provider]: true,
      }));
      try {
        const billingSnapshot = await requestUsageProviderBilling({
          provider,
          refresh: forceRefresh,
        });
        if (requestId !== billingRequestIdRef.current[provider]) {
          return;
        }
        setDashboard((current) => {
          if (!current) {
            return current;
          }
          return {
            ...current,
            providers: current.providers.map((item) => {
              if (item.providerId !== provider) {
                return item;
              }
              return {
                ...item,
                billing: billingSnapshot.billing,
                capabilities: {
                  ...item.capabilities,
                  cost: billingSnapshot.capabilities.cost,
                },
                issues: mergeIssues(item.issues, billingSnapshot.issues),
              };
            }),
          };
        });
      } catch (error) {
        if (requestId !== billingRequestIdRef.current[provider]) {
          return;
        }
        const reasonMessage = resolveErrorMessage(error, API_ERROR_MESSAGES.usageProviderBilling);
        const issue: UsageIssue = {
          code: "COST_SOURCE_UNAVAILABLE",
          message: reasonMessage,
          severity: "warning",
        };
        setDashboard((current) => {
          if (!current) {
            return current;
          }
          return {
            ...current,
            providers: current.providers.map((item) => {
              if (item.providerId !== provider) {
                return item;
              }
              return {
                ...item,
                billing: {
                  ...item.billing,
                  meta: {
                    source: "unavailable",
                    sourceLabel: item.billing.meta.sourceLabel,
                    confidence: null,
                    updatedAt: new Date().toISOString(),
                    reasonCode: issue.code,
                    reasonMessage: issue.message,
                  },
                  modelBreakdown: [],
                  dailyBreakdown: [],
                },
                issues: mergeIssues(item.issues, [issue]),
              };
            }),
          };
        });
      } finally {
        if (requestId === billingRequestIdRef.current[provider]) {
          setBillingLoadingByProvider((current) => ({
            ...current,
            [provider]: false,
          }));
        }
      }
    },
    [canRequest, requestUsageProviderBilling, resolveErrorMessage],
  );

  const loadAllProviderBilling = useCallback(
    async ({
      providers,
      forceRefresh = false,
    }: {
      providers?: BillingProviderId[];
      forceRefresh?: boolean;
    } = {}) => {
      const targets = providers ?? dashboardBillingProvidersRef.current;
      if (targets.length === 0) {
        return;
      }
      await Promise.all(
        targets.map((provider) =>
          loadProviderBilling({
            provider,
            forceRefresh,
          }),
        ),
      );
    },
    [loadProviderBilling],
  );

  const loadDashboard = useCallback(
    async ({
      forceRefresh = false,
      silent = false,
      withBilling = true,
    }: {
      forceRefresh?: boolean;
      silent?: boolean;
      withBilling?: boolean;
    } = {}) => {
      const requestId = ++dashboardRequestIdRef.current;
      if (!canRequest) {
        setDashboard(null);
        setDashboardError(API_ERROR_MESSAGES.missingToken);
        initialBillingRequestedRef.current = false;
        setBillingLoadingByProvider({
          codex: false,
          claude: false,
        });
        return;
      }
      if (!silent) {
        setDashboardLoading(true);
      }
      try {
        const next = await requestUsageDashboard({
          refresh: forceRefresh,
        });
        if (requestId !== dashboardRequestIdRef.current) {
          return;
        }
        setDashboard((current) => mergeDashboardCore(current, next));
        setDashboardError(null);
        const billingProviders = next.providers
          .map((provider) => provider.providerId)
          .filter(isBillingProviderId);
        dashboardBillingProvidersRef.current =
          billingProviders.length > 0 ? billingProviders : FALLBACK_BILLING_PROVIDERS;
        const shouldLoadBilling = withBilling || !initialBillingRequestedRef.current;
        if (shouldLoadBilling) {
          initialBillingRequestedRef.current = true;
          void loadAllProviderBilling({
            providers: dashboardBillingProvidersRef.current,
            forceRefresh,
          });
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
    [canRequest, loadAllProviderBilling, requestUsageDashboard, resolveErrorMessage],
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
    intervalMs: DASHBOARD_POLL_INTERVAL_MS,
    onTick: () => {
      void loadDashboard({ silent: true, withBilling: false });
    },
    onResume: () => {
      void loadDashboard({ silent: true, withBilling: false });
    },
  });

  useVisibilityPolling({
    enabled: canRequest,
    intervalMs: BILLING_POLL_INTERVAL_MS,
    onTick: () => {
      void loadAllProviderBilling();
    },
    onResume: () => {
      void loadAllProviderBilling();
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
      loadDashboard({ forceRefresh: true, withBilling: true }),
      loadTimeline({ range: timelineRange }),
    ]);
  }, [loadDashboard, loadTimeline, timelineRange]);

  const handleOpenPaneInNewWindow = useCallback(
    (targetPaneId: string) => {
      closeQuickPanel();
      closeLogModal();
      if (pwaTabsEnabled) {
        openSessionTab(targetPaneId);
        return;
      }
      const encoded = encodeURIComponent(targetPaneId);
      window.open(`/sessions/${encoded}`, "_blank", "noopener,noreferrer");
    },
    [closeLogModal, closeQuickPanel, openSessionTab, pwaTabsEnabled],
  );

  const handleOpenPaneHere = useCallback(
    (targetPaneId: string) => {
      closeQuickPanel();
      closeLogModal();
      void navigate({
        to: "/sessions/$paneId",
        params: { paneId: targetPaneId },
      });
    },
    [closeLogModal, closeQuickPanel, navigate],
  );

  const handleOpenHere = useCallback(() => {
    if (!selectedPaneId) return;
    handleOpenPaneHere(selectedPaneId);
  }, [handleOpenPaneHere, selectedPaneId]);

  const handleOpenInNewTab = useCallback(() => {
    if (!selectedPaneId) return;
    handleOpenPaneInNewWindow(selectedPaneId);
  }, [handleOpenPaneInNewWindow, selectedPaneId]);

  const handleLaunchAgentInSession = useCallback(
    async (sessionName: string, agent: "codex" | "claude", options?: LaunchAgentRequestOptions) => {
      await launchAgentInSession(sessionName, agent, createLaunchRequestId(), options);
    },
    [launchAgentInSession],
  );

  return {
    sessions,
    connected,
    connectionIssue,
    launchConfig,
    requestWorktrees,
    requestStateTimeline,
    requestScreen,
    highlightCorrections,
    resolvedTheme,
    sidebarSessionGroups,
    sidebarWidth,
    dashboard,
    dashboardLoading,
    billingLoadingByProvider,
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
    quickPanelGroups,
    quickPanelOpen,
    logModalOpen,
    selectedSession,
    selectedLogLines,
    selectedLogLoading,
    selectedLogError,
    onOpenLogModal: openLogModal,
    onCloseLogModal: closeLogModal,
    onToggleQuickPanel: toggleQuickPanel,
    onCloseQuickPanel: closeQuickPanel,
    onOpenPaneHere: handleOpenPaneHere,
    onOpenPaneInNewWindow: handleOpenPaneInNewWindow,
    onSidebarResizeStart: handlePointerDown,
    onLaunchAgentInSession: handleLaunchAgentInSession,
    onTouchPanePin: touchPanePin,
    onTouchRepoPin: touchRepoPin,
    onOpenHere: handleOpenHere,
    onOpenNewTab: handleOpenInNewTab,
  };
};

export type UsageDashboardVM = ReturnType<typeof useUsageDashboardVM>;
