import { render, screen } from "@testing-library/react";
import type { UsageProviderSnapshot } from "@vde-monitor/shared";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { UsageDashboardView } from "./UsageDashboardView";
import type { UsageDashboardVM } from "./useUsageDashboardVM";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => <a href="/">{children}</a>,
}));

vi.mock("@/components/theme-toggle", () => ({
  ThemeToggle: () => <div data-testid="theme-toggle" />,
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

const createViewModel = (codexProvider: UsageProviderSnapshot): UsageDashboardVM => ({
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
});

describe("UsageDashboardView", () => {
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
});
