import { fireEvent, render, screen } from "@testing-library/react";
import type { UsageGlobalTimelineResponse, UsageProviderSnapshot } from "@vde-monitor/shared";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import * as pwaDisplayMode from "@/lib/pwa-display-mode";

import { UsageDashboardView } from "./UsageDashboardView";
import type { UsageDashboardVM } from "./useUsageDashboardVM";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => <a href="/">{children}</a>,
}));

vi.mock("@/components/theme-toggle", () => ({
  ThemeToggle: () => <div data-testid="theme-toggle" />,
}));

vi.mock("@/features/shared-session-ui/components/SessionSidebar", () => ({
  SessionSidebar: () => <div data-testid="session-sidebar" />,
}));

const createProvider = (
  providerId: "codex" | "claude",
  overrides: Partial<UsageProviderSnapshot> = {},
): UsageProviderSnapshot => ({
  providerId,
  providerLabel: providerId === "codex" ? "Codex" : "Claude",
  accountLabel: null,
  planLabel: null,
  windows: [
    {
      id: "session",
      title: "Session",
      utilizationPercent: 10,
      windowDurationMs: 300 * 60 * 1000,
      resetsAt: "2026-02-24T12:00:00.000Z",
      pace: {
        elapsedPercent: 20,
        projectedEndUtilizationPercent: 50,
        paceMarginPercent: 30,
        status: "margin",
      },
    },
    {
      id: "weekly",
      title: "Weekly",
      utilizationPercent: 40,
      windowDurationMs: 10_080 * 60 * 1000,
      resetsAt: "2026-02-28T12:00:00.000Z",
      pace: {
        elapsedPercent: 30,
        projectedEndUtilizationPercent: 70,
        paceMarginPercent: 10,
        status: "balanced",
      },
    },
  ],
  billing: {
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
  },
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
  fetchedAt: "2026-02-24T12:00:00.000Z",
  staleAt: "2026-02-24T12:03:00.000Z",
  ...overrides,
});

const createTimeline = (
  overrides: Partial<UsageGlobalTimelineResponse["repoRanking"]> = {},
): UsageGlobalTimelineResponse => ({
  timeline: {
    paneId: "global",
    now: "2026-02-25T00:00:00.000Z",
    range: "1h",
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
  paneCount: 3,
  activePaneCount: 2,
  repoRanking: {
    totalRepoCount: 2,
    byRunningTimeSum: [
      {
        repoRoot: "/repo/sum-first",
        repoName: "sum-first",
        totalPaneCount: 2,
        activePaneCount: 1,
        runningMs: 6 * 60 * 1000,
        runningUnionMs: 4 * 60 * 1000,
        executionCount: 3,
        approximate: false,
        approximationReason: null,
      },
      {
        repoRoot: "/repo/sum-second",
        repoName: "sum-second",
        totalPaneCount: 1,
        activePaneCount: 1,
        runningMs: 4 * 60 * 1000,
        runningUnionMs: 4 * 60 * 1000,
        executionCount: 1,
        approximate: true,
        approximationReason: "retention_clipped",
      },
    ],
    byRunningTimeUnion: [
      {
        repoRoot: "/repo/union-first",
        repoName: "union-first",
        totalPaneCount: 2,
        activePaneCount: 2,
        runningMs: 7 * 60 * 1000,
        runningUnionMs: 6 * 60 * 1000,
        executionCount: 2,
        approximate: false,
        approximationReason: null,
      },
    ],
    byRunningTransitions: [
      {
        repoRoot: "/repo/transitions-first",
        repoName: "transitions-first",
        totalPaneCount: 1,
        activePaneCount: 1,
        runningMs: 2 * 60 * 1000,
        runningUnionMs: 2 * 60 * 1000,
        executionCount: 9,
        approximate: false,
        approximationReason: null,
      },
    ],
    ...overrides,
  },
  fetchedAt: "2026-02-25T00:00:00.000Z",
});

const createViewModel = (
  codexProvider: UsageProviderSnapshot,
  overrides: Partial<UsageDashboardVM> = {},
): UsageDashboardVM => ({
  sessions: [],
  connected: true,
  connectionIssue: null,
  launchConfig: {} as UsageDashboardVM["launchConfig"],
  requestWorktrees: vi.fn() as UsageDashboardVM["requestWorktrees"],
  requestStateTimeline: vi.fn() as UsageDashboardVM["requestStateTimeline"],
  requestScreen: vi.fn() as UsageDashboardVM["requestScreen"],
  highlightCorrections: {} as UsageDashboardVM["highlightCorrections"],
  resolvedTheme: "latte",
  sidebarSessionGroups: [],
  sidebarWidth: 280,
  dashboard: {
    providers: [codexProvider, createProvider("claude", { windows: [] })],
    fetchedAt: "2026-02-24T12:00:00.000Z",
  },
  dashboardLoading: false,
  billingLoadingByProvider: {
    codex: false,
    claude: false,
  },
  dashboardError: null,
  timeline: null,
  timelineLoading: false,
  timelineError: null,
  timelineRange: "1h",
  compactTimeline: false,
  nowMs: Date.now(),
  onTimelineRangeChange: vi.fn(),
  onToggleCompactTimeline: vi.fn(),
  onRefreshAll: vi.fn(),
  quickPanelGroups: [],
  quickPanelOpen: false,
  logModalOpen: false,
  selectedSession: null,
  selectedLogLines: [],
  selectedLogLoading: false,
  selectedLogError: null,
  onOpenLogModal: vi.fn(),
  onCloseLogModal: vi.fn(),
  onToggleQuickPanel: vi.fn(),
  onCloseQuickPanel: vi.fn(),
  onOpenPaneHere: vi.fn(),
  onOpenPaneInNewWindow: vi.fn(),
  onSidebarResizeStart: vi.fn(),
  onLaunchAgentInSession: vi.fn() as UsageDashboardVM["onLaunchAgentInSession"],
  onTouchPanePin: vi.fn(),
  onTouchRepoPin: vi.fn(),
  onOpenHere: vi.fn(),
  onOpenNewTab: vi.fn(),
  ...overrides,
});

describe("UsageDashboardView", () => {
  it("renders desktop sidebar shell", () => {
    render(<UsageDashboardView {...createViewModel(createProvider("codex"))} />);

    expect(screen.getByTestId("session-sidebar")).toBeTruthy();
    expect(screen.getByRole("separator", { name: "Resize sidebar" })).toBeTruthy();
  });

  it("shows history controls only in pwa display mode", () => {
    const isPwaDisplayModeSpy = vi.spyOn(pwaDisplayMode, "isPwaDisplayMode");
    const viewModel = createViewModel(createProvider("codex"));
    isPwaDisplayModeSpy.mockReturnValue(false);
    const { rerender } = render(<UsageDashboardView {...viewModel} />);

    expect(screen.queryByLabelText("Go back")).toBeNull();
    expect(screen.queryByLabelText("Go forward")).toBeNull();

    isPwaDisplayModeSpy.mockReturnValue(true);
    rerender(<UsageDashboardView {...viewModel} />);

    expect(screen.getByLabelText("Go back")).toBeTruthy();
    expect(screen.getByLabelText("Go forward")).toBeTruthy();

    isPwaDisplayModeSpy.mockRestore();
  });

  it("calls browser history methods from history controls", () => {
    const isPwaDisplayModeSpy = vi.spyOn(pwaDisplayMode, "isPwaDisplayMode");
    const backSpy = vi.spyOn(window.history, "back").mockImplementation(() => undefined);
    const forwardSpy = vi.spyOn(window.history, "forward").mockImplementation(() => undefined);
    isPwaDisplayModeSpy.mockReturnValue(true);
    render(<UsageDashboardView {...createViewModel(createProvider("codex"))} />);

    fireEvent.click(screen.getByLabelText("Go back"));
    fireEvent.click(screen.getByLabelText("Go forward"));

    expect(backSpy).toHaveBeenCalledTimes(1);
    expect(forwardSpy).toHaveBeenCalledTimes(1);

    isPwaDisplayModeSpy.mockRestore();
    backSpy.mockRestore();
    forwardSpy.mockRestore();
  });

  it("hides session metric when capabilities.session is false", () => {
    const codex = createProvider("codex", {
      capabilities: {
        session: false,
        weekly: true,
        pace: true,
        modelWindows: false,
        credits: false,
        extraUsage: false,
        cost: false,
      },
    });

    render(<UsageDashboardView {...createViewModel(codex)} />);

    expect(screen.queryByText("Session")).toBeNull();
    expect(screen.getByText("Weekly")).toBeTruthy();
  });

  it("renders session metric when capabilities.session is true", () => {
    const codex = createProvider("codex");

    render(<UsageDashboardView {...createViewModel(codex)} />);

    expect(screen.getByText("Session")).toBeTruthy();
    expect(screen.getByText("Weekly")).toBeTruthy();
  });

  it("renders used/elapsed percent with shared formatting across all windows", () => {
    const codex = createProvider("codex", {
      windows: [
        {
          id: "session",
          title: "Session",
          utilizationPercent: 10,
          windowDurationMs: 300 * 60 * 1000,
          resetsAt: "2026-02-24T12:00:00.000Z",
          pace: {
            elapsedPercent: 20,
            projectedEndUtilizationPercent: 50,
            paceMarginPercent: 30,
            status: "margin",
          },
        },
        {
          id: "weekly",
          title: "Weekly",
          utilizationPercent: 40,
          windowDurationMs: 10_080 * 60 * 1000,
          resetsAt: "2026-02-28T12:00:00.000Z",
          pace: {
            elapsedPercent: 30,
            projectedEndUtilizationPercent: 70,
            paceMarginPercent: 10,
            status: "balanced",
          },
        },
        {
          id: "model",
          title: "Sonnet Weekly",
          utilizationPercent: 12,
          windowDurationMs: 10_080 * 60 * 1000,
          resetsAt: "2026-02-28T12:00:00.000Z",
          pace: {
            elapsedPercent: 8.5,
            projectedEndUtilizationPercent: 141.2,
            paceMarginPercent: -41.2,
            status: "over",
          },
        },
      ],
    });

    render(<UsageDashboardView {...createViewModel(codex)} />);

    expect(screen.getByText("10% / 20%")).toBeTruthy();
    expect(screen.getByText("40% / 30%")).toBeTruthy();
    expect(screen.getByText("12% / 8.5%")).toBeTruthy();
  });

  it("colors usage bars by relative position to elapsed line", () => {
    const codex = createProvider("codex", {
      windows: [
        {
          id: "session",
          title: "Ahead",
          utilizationPercent: 10,
          windowDurationMs: 300 * 60 * 1000,
          resetsAt: "2026-02-24T12:00:00.000Z",
          pace: {
            elapsedPercent: 20,
            projectedEndUtilizationPercent: 50,
            paceMarginPercent: 10,
            status: "margin",
          },
        },
        {
          id: "weekly",
          title: "Near pace",
          utilizationPercent: 24,
          windowDurationMs: 10_080 * 60 * 1000,
          resetsAt: "2026-02-28T12:00:00.000Z",
          pace: {
            elapsedPercent: 20,
            projectedEndUtilizationPercent: 96,
            paceMarginPercent: 4,
            status: "margin",
          },
        },
        {
          id: "model",
          title: "Over pace",
          utilizationPercent: 35,
          windowDurationMs: 10_080 * 60 * 1000,
          resetsAt: "2026-02-28T12:00:00.000Z",
          pace: {
            elapsedPercent: 20,
            projectedEndUtilizationPercent: 175,
            paceMarginPercent: -15,
            status: "over",
          },
        },
      ],
    });

    const { container } = render(<UsageDashboardView {...createViewModel(codex)} />);

    expect(container.querySelectorAll('[class*="bg-latte-green/85"]')).toHaveLength(1);
    expect(container.querySelectorAll('[class*="bg-latte-yellow/85"]')).toHaveLength(1);
    expect(container.querySelectorAll('[class*="bg-latte-red/85"]')).toHaveLength(1);
  });

  it("keeps pace and buffer badges yellow in relaxed near-pace range", () => {
    const codex = createProvider("codex", {
      windows: [
        {
          id: "session",
          title: "Session",
          utilizationPercent: 24,
          windowDurationMs: 300 * 60 * 1000,
          resetsAt: "2026-02-24T12:00:00.000Z",
          pace: {
            elapsedPercent: 20,
            projectedEndUtilizationPercent: 96,
            paceMarginPercent: 4,
            status: "margin",
          },
        },
      ],
    });

    render(<UsageDashboardView {...createViewModel(codex)} />);

    const bufferBadge = screen.getByText("Buffer -4%");
    const paceBadge = screen.getByText("Pace +4% margin");

    expect(bufferBadge.className).toContain("text-latte-yellow");
    expect(bufferBadge.className).not.toContain("text-latte-red");
    expect(bufferBadge.className).not.toContain("text-latte-green");
    expect(paceBadge.className).toContain("text-latte-yellow");
    expect(paceBadge.className).not.toContain("text-latte-red");
    expect(paceBadge.className).not.toContain("text-latte-green");
  });

  it("renders Active Repository section above Global State Timeline", () => {
    render(
      <UsageDashboardView
        {...createViewModel(createProvider("codex"), {
          timeline: createTimeline(),
        })}
      />,
    );

    const repoHeading = screen.getByRole("heading", { name: "Active Repository" });
    const timelineHeading = screen.getByRole("heading", { name: "Global State Timeline" });
    expect(
      repoHeading.compareDocumentPosition(timelineHeading) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0);
    expect(
      screen.queryByText(
        "Running(sum) counts overlaps across panes. Running(union) removes overlaps.",
      ),
    ).toBeNull();
  });

  it("switches ranking rows by tab", () => {
    render(
      <UsageDashboardView
        {...createViewModel(createProvider("codex"), {
          timeline: createTimeline(),
        })}
      />,
    );

    expect(screen.getByText("Running Time (Sum)")).toBeTruthy();
    expect(screen.getByText("Running Time (Union)")).toBeTruthy();
    expect(screen.getByText("RUNNING Transitions")).toBeTruthy();
    expect(screen.getByText("Runs 3")).toBeTruthy();

    const unionTab = screen.getByRole("tab", { name: "Running Time (Union)" });
    fireEvent.mouseDown(unionTab, { button: 0 });
    expect(unionTab.getAttribute("data-state")).toBe("active");
    expect(screen.getByText("Runs 2")).toBeTruthy();

    const transitionsTab = screen.getByRole("tab", { name: "RUNNING Transitions" });
    fireEvent.mouseDown(transitionsTab, { button: 0 });
    expect(transitionsTab.getAttribute("data-state")).toBe("active");
    expect(screen.getAllByText("Runs 9").length).toBeGreaterThan(0);
  });

  it("shows ranking row metrics and Approx tag", () => {
    render(
      <UsageDashboardView
        {...createViewModel(createProvider("codex"), {
          timeline: createTimeline(),
        })}
      />,
    );

    expect(screen.queryByText("Baseline (#1)")).toBeNull();
    expect(screen.queryByText(/Across all repos in this range/)).toBeNull();
    expect(screen.queryByText("Relative to #1")).toBeNull();
    expect(screen.getByText("Sum 6m")).toBeTruthy();
    expect(screen.getAllByText("Union 4m")).toHaveLength(2);
    expect(screen.getByText("Runs 3")).toBeTruthy();
    expect(screen.queryByText(/Panes/)).toBeNull();
    const approx = screen.getByText("Approx");
    expect(approx.getAttribute("title")).toBe("Range start is outside retained timeline history.");
  });

  it("switches aggregation range from ranking range tabs", () => {
    const onTimelineRangeChange = vi.fn();
    render(
      <UsageDashboardView
        {...createViewModel(createProvider("codex"), {
          timeline: createTimeline(),
          timelineRange: "24h",
          onTimelineRangeChange,
        })}
      />,
    );

    expect(screen.queryByRole("tab", { name: "15m" })).toBeNull();
    expect(screen.queryByRole("tab", { name: "1h" })).toBeNull();
    expect(screen.queryByRole("tab", { name: "3h" })).toBeNull();
    expect(screen.getByRole("tab", { name: "14d" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "30d" })).toBeTruthy();

    const rangeTab = screen.getByRole("tab", { name: "30d" });
    fireEvent.mouseDown(rangeTab, { button: 0 });
    expect(onTimelineRangeChange).toHaveBeenCalledWith("30d");
  });

  it("formats long running metrics to minute precision and compacts home path", () => {
    render(
      <UsageDashboardView
        {...createViewModel(createProvider("codex"), {
          timeline: createTimeline({
            totalRepoCount: 1,
            byRunningTimeSum: [
              {
                repoRoot: "/Users/yuki-yano/repos/github.com/yuki-yano/vde-monitor",
                repoName: "vde-monitor",
                totalPaneCount: 2,
                activePaneCount: 1,
                runningMs: (2 * 24 * 60 + 3 * 60 + 4) * 60 * 1000,
                runningUnionMs: (24 * 60 + 60 + 2) * 60 * 1000,
                executionCount: 3,
                approximate: false,
                approximationReason: null,
              },
            ],
            byRunningTimeUnion: [
              {
                repoRoot: "/Users/yuki-yano/repos/github.com/yuki-yano/vde-monitor",
                repoName: "vde-monitor",
                totalPaneCount: 2,
                activePaneCount: 1,
                runningMs: (2 * 24 * 60 + 3 * 60 + 4) * 60 * 1000,
                runningUnionMs: (24 * 60 + 60 + 2) * 60 * 1000,
                executionCount: 3,
                approximate: false,
                approximationReason: null,
              },
            ],
            byRunningTransitions: [
              {
                repoRoot: "/Users/yuki-yano/repos/github.com/yuki-yano/vde-monitor",
                repoName: "vde-monitor",
                totalPaneCount: 2,
                activePaneCount: 1,
                runningMs: (2 * 24 * 60 + 3 * 60 + 4) * 60 * 1000,
                runningUnionMs: (24 * 60 + 60 + 2) * 60 * 1000,
                executionCount: 3,
                approximate: false,
                approximationReason: null,
              },
            ],
          }),
        })}
      />,
    );

    expect(screen.getByText("Sum 2d 3h 4m")).toBeTruthy();
    expect(screen.getByText("Union 1d 1h 2m")).toBeTruthy();
    expect(screen.getByText("~/repos/github.com/yuki-yano/vde-monitor")).toBeTruthy();
  });

  it("shows empty state when all ranking lists are empty", () => {
    render(
      <UsageDashboardView
        {...createViewModel(createProvider("codex"), {
          timeline: createTimeline({
            totalRepoCount: 0,
            byRunningTimeSum: [],
            byRunningTimeUnion: [],
            byRunningTransitions: [],
          }),
        })}
      />,
    );

    expect(screen.getByText("No repository activity in this range.")).toBeTruthy();
  });

  it("renders usage breakdown dates in local time zone", () => {
    const codex = createProvider("codex");
    codex.billing = {
      ...codex.billing,
      meta: {
        ...codex.billing.meta,
        source: "actual",
      },
      dailyBreakdown: [
        {
          date: "2026-02-24",
          modelIds: ["gpt-5"],
          inputTokens: 100,
          outputTokens: 50,
          cacheCreationInputTokens: 0,
          cacheReadInputTokens: 0,
          totalTokens: 150,
          usd: 1.23,
        },
      ],
    };

    render(<UsageDashboardView {...createViewModel(codex)} />);

    fireEvent.click(screen.getByRole("button", { name: "Usage breakdown (last 30 days)" }));

    const expectedDate = new Date("2026-02-24T00:00:00.000Z").toLocaleDateString();
    expect(screen.getByText(expectedDate)).toBeTruthy();
  });
});
