import { configDefaults } from "@vde-monitor/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createUsageDashboardService } from "./usage-dashboard-service";

const mocks = vi.hoisted(() => ({
  fetchCodexRateLimits: vi.fn(),
  fetchClaudeOauthUsage: vi.fn(),
  resolveClaudeOauthToken: vi.fn(),
}));

vi.mock("../codex-usage/codex-usage-service", () => ({
  fetchCodexRateLimits: mocks.fetchCodexRateLimits,
}));

vi.mock("../claude-usage/claude-usage-service", () => ({
  fetchClaudeOauthUsage: mocks.fetchClaudeOauthUsage,
  resolveClaudeOauthToken: mocks.resolveClaudeOauthToken,
}));

const codexRateLimitsResponse = {
  rateLimits: {
    limitId: "limit-primary",
    limitName: "Codex Pro",
    planType: "pro",
    credits: {
      hasCredits: true,
      unlimited: false,
      balance: "100",
    },
    primary: {
      usedPercent: 12,
      windowDurationMins: 300,
      resetsAt: 1_700_000_000,
    },
    secondary: {
      usedPercent: 45,
      windowDurationMins: 10_080,
      resetsAt: 1_700_500_000,
    },
  },
  rateLimitsByLimitId: null,
};

describe("createUsageDashboardService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fetchCodexRateLimits.mockResolvedValue(codexRateLimitsResponse);
    mocks.resolveClaudeOauthToken.mockResolvedValue("token");
    mocks.fetchClaudeOauthUsage.mockResolvedValue({
      fiveHour: {
        utilizationPercent: 10,
        resetsAt: "2026-02-24T12:00:00.000Z",
        windowDurationMins: 300,
      },
      sevenDay: {
        utilizationPercent: 30,
        resetsAt: "2026-02-28T12:00:00.000Z",
        windowDurationMins: 10_080,
      },
      sevenDaySonnet: null,
    });
  });

  it("hides session window when usage.session provider is disabled", async () => {
    const service = createUsageDashboardService({
      usageConfig: {
        ...configDefaults.usage,
        session: {
          providers: {
            ...configDefaults.usage.session.providers,
            codex: {
              enabled: false,
            },
          },
        },
      },
    });

    const dashboard = await service.getDashboard({ provider: "codex" });
    expect(dashboard.providers).toHaveLength(1);
    expect(dashboard.providers[0]?.windows.some((window) => window.id === "session")).toBe(false);
    expect(dashboard.providers[0]?.capabilities.session).toBe(false);

    const provider = await service.getProviderSnapshot("codex");
    expect(provider.windows.some((window) => window.id === "session")).toBe(false);
    expect(provider.capabilities.session).toBe(false);
  });

  it("keeps session window when usage.session provider is enabled", async () => {
    const service = createUsageDashboardService({
      usageConfig: configDefaults.usage,
    });

    const provider = await service.getProviderSnapshot("codex");

    expect(provider.windows.some((window) => window.id === "session")).toBe(true);
    expect(provider.capabilities.session).toBe(true);
  });
});
