import { useNavigate } from "@tanstack/react-router";
import type { UsageDashboardResponse } from "@vde-monitor/shared";
import { useCallback, useMemo, useState } from "react";
import { createLaunchRequestId } from "@/lib/request-id";

import { useWorkspaceTabs } from "@/features/pwa-tabs/context/workspace-tabs-context";
import { useSessionListPins } from "@/features/shared-session-ui/hooks/useSessionListPins";
import { useSessionLogs } from "@/features/shared-session-ui/hooks/useSessionLogs";
import { buildSessionGroups } from "@/lib/session-group";
import { useNowMs } from "@/lib/use-now-ms";
import { useSidebarWidth } from "@/lib/use-sidebar-width";
import type { LaunchAgentRequestOptions } from "@/state/launch-agent-options";
import {
  useSessionBranchesApi,
  useSessionConfigData,
  useSessionCoreApi,
  useSessionLaunchApi,
  useSessionStreamData,
} from "@/state/session-context";
import { useTheme } from "@/state/theme-context";
import { useUsageApi } from "@/state/use-usage-api";

import { useUsageBillingData } from "./useUsageBillingData";
import { useUsageDashboardData } from "./useUsageDashboardData";
import { useUsageTimelineData } from "./useUsageTimelineData";

export const useUsageDashboardVM = () => {
  const { sessions, connected, connectionIssue } = useSessionStreamData();
  const { token, apiBaseUrl, launchConfig, highlightCorrections } = useSessionConfigData();
  const { requestStateTimeline, requestScreen, touchSession } = useSessionCoreApi();
  const { requestWorktrees } = useSessionBranchesApi();
  const { launchAgentInSession } = useSessionLaunchApi();
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

  const canRequest = Boolean(token);
  const nowMs = useNowMs(30_000);

  // dashboard state is lifted to the VM so both the dashboard-data and billing hooks
  // can read/update it without circular hook dependencies.
  const [dashboard, setDashboard] = useState<UsageDashboardResponse | null>(null);

  const { billingLoadingByProvider, loadAllProviderBilling, resetBillingState } =
    useUsageBillingData({
      canRequest,
      requestUsageProviderBilling,
      resolveErrorMessage,
      setDashboard,
    });

  const { dashboardLoading, dashboardError, loadDashboard } = useUsageDashboardData({
    canRequest,
    requestUsageDashboard,
    resolveErrorMessage,
    setDashboard,
    loadAllProviderBilling,
    resetBillingState,
  });

  const {
    timeline,
    timelineLoading,
    timelineError,
    timelineRange,
    setTimelineRange,
    compactTimeline,
    setCompactTimeline,
    loadTimeline,
  } = useUsageTimelineData({
    canRequest,
    requestUsageGlobalTimeline,
    resolveErrorMessage,
  });

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
