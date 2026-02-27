import { act, renderHook, waitFor } from "@testing-library/react";
import type {
  SessionSummary,
  UsageDashboardResponse,
  UsageGlobalTimelineResponse,
  UsageProviderSnapshot,
} from "@vde-monitor/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { defaultLaunchConfig } from "@/state/launch-agent-options";

import { useUsageDashboardVM } from "./useUsageDashboardVM";

const mockUseSessions = vi.hoisted(() => vi.fn());
const mockUseUsageApi = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock("@/state/session-context", () => ({
  useSessions: () => mockUseSessions(),
}));

vi.mock("@/state/use-usage-api", () => ({
  useUsageApi: (...args: unknown[]) => mockUseUsageApi(...args),
}));

vi.mock("@/state/theme-context", () => ({
  useTheme: () => ({ resolvedTheme: "latte" }),
}));

vi.mock("@/lib/use-now-ms", () => ({
  useNowMs: () => 0,
}));

vi.mock("@/lib/use-sidebar-width", () => ({
  useSidebarWidth: () => ({
    sidebarWidth: 280,
    handlePointerDown: vi.fn(),
  }),
}));

vi.mock("@/lib/use-visibility-polling", () => ({
  useVisibilityPolling: vi.fn(),
}));

vi.mock("@/lib/session-group", () => ({
  buildSessionGroups: () => [],
}));

vi.mock("@/features/pwa-tabs/context/workspace-tabs-context", () => ({
  useWorkspaceTabs: () => ({
    enabled: false,
    openSessionTab: vi.fn(),
  }),
}));

vi.mock("@/features/shared-session-ui/hooks/useSessionListPins", () => ({
  useSessionListPins: () => ({
    getRepoSortAnchorAt: () => 0,
    touchRepoPin: vi.fn(),
    touchPanePin: vi.fn(),
  }),
}));

vi.mock("@/features/shared-session-ui/hooks/useSessionLogs", () => ({
  useSessionLogs: () => ({
    quickPanelOpen: false,
    logModalOpen: false,
    selectedPaneId: null,
    selectedSession: null,
    selectedLogLines: [],
    selectedLogLoading: false,
    selectedLogError: null,
    openLogModal: vi.fn(),
    closeLogModal: vi.fn(),
    toggleQuickPanel: vi.fn(),
    closeQuickPanel: vi.fn(),
  }),
}));

const NOW_ISO = "2026-02-27T00:00:00.000Z";

const createBilling = (): UsageProviderSnapshot["billing"] => ({
  creditsLeft: null,
  creditsUnit: null,
  extraUsageUsedUsd: null,
  extraUsageLimitUsd: null,
  costTodayUsd: null,
  costTodayTokens: null,
  costLast30DaysUsd: null,
  costLast30DaysTokens: null,
  meta: {
    source: "unavailable",
    sourceLabel: null,
    confidence: null,
    updatedAt: null,
    reasonCode: null,
    reasonMessage: null,
  },
  modelBreakdown: [],
  dailyBreakdown: [],
});

const createProviderSnapshot = (providerId: "codex" | "claude"): UsageProviderSnapshot => ({
  providerId,
  providerLabel: providerId === "codex" ? "Codex" : "Claude",
  accountLabel: null,
  planLabel: null,
  windows: [],
  billing: createBilling(),
  capabilities: {
    session: true,
    weekly: true,
    pace: true,
    modelWindows: false,
    credits: false,
    extraUsage: false,
    cost: false,
  },
  status: "ok",
  issues: [],
  fetchedAt: NOW_ISO,
  staleAt: NOW_ISO,
});

const createDashboardResponse = (): UsageDashboardResponse => ({
  providers: [createProviderSnapshot("codex"), createProviderSnapshot("claude")],
  fetchedAt: NOW_ISO,
});

const createTimelineResponse = (): UsageGlobalTimelineResponse => ({
  timeline: {
    paneId: "global",
    now: NOW_ISO,
    range: "24h",
    items: [],
    totalsMs: {
      RUNNING: 0,
      WAITING_INPUT: 0,
      WAITING_PERMISSION: 0,
      SHELL: 0,
      UNKNOWN: 0,
    },
    current: null,
  },
  paneCount: 0,
  activePaneCount: 0,
  repoRanking: {
    totalRepoCount: 0,
    byRunningTimeSum: [],
    byRunningTimeUnion: [],
    byRunningTransitions: [],
  },
  fetchedAt: NOW_ISO,
});

describe("useUsageDashboardVM", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSessions.mockReturnValue({
      token: "token",
      apiBaseUrl: "/api",
      sessions: [] as SessionSummary[],
      connected: true,
      connectionIssue: null,
      launchConfig: defaultLaunchConfig,
      requestWorktrees: vi.fn(),
      requestStateTimeline: vi.fn(),
      requestScreen: vi.fn(),
      launchAgentInSession: vi.fn(),
      touchSession: vi.fn(),
      highlightCorrections: { codex: true, claude: true },
    });
  });

  it("does not fire duplicate billing request for provider while previous request is pending", async () => {
    let resolveCodexBilling: ((value: UsageProviderSnapshot) => void) | undefined;
    const codexBillingPromise = new Promise<UsageProviderSnapshot>((resolve) => {
      resolveCodexBilling = resolve;
    });

    const requestUsageProviderBilling = vi.fn(
      async ({ provider }: { provider: "codex" | "claude" }) => {
        if (provider === "codex") {
          return codexBillingPromise;
        }
        return createProviderSnapshot("claude");
      },
    );

    mockUseUsageApi.mockReturnValue({
      requestUsageDashboard: vi.fn(async () => createDashboardResponse()),
      requestUsageProviderBilling,
      requestUsageGlobalTimeline: vi.fn(async () => createTimelineResponse()),
      resolveErrorMessage: (_error: unknown, fallback: string) => fallback,
    });

    const { result } = renderHook(() => useUsageDashboardVM());

    await waitFor(() => {
      const codexCalls = requestUsageProviderBilling.mock.calls.filter(
        ([args]) => args.provider === "codex",
      );
      expect(codexCalls).toHaveLength(1);
    });

    await act(async () => {
      result.current.onRefreshAll();
      result.current.onRefreshAll();
    });

    await waitFor(() => {
      const codexCalls = requestUsageProviderBilling.mock.calls.filter(
        ([args]) => args.provider === "codex",
      );
      expect(codexCalls).toHaveLength(1);
    });

    resolveCodexBilling?.(createProviderSnapshot("codex"));

    await waitFor(() => {
      expect(result.current.billingLoadingByProvider.codex).toBe(false);
    });
  });
});
