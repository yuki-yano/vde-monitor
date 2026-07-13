import { configDefaults } from "@vde-monitor/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createUsageDashboardService } from "./usage-dashboard-service";

const mocks = vi.hoisted(() => ({
  fetchCodexRateLimits: vi.fn(),
  fetchClaudeOauthUsageWithFallback: vi.fn(),
}));

vi.mock("../codex-usage/codex-usage-service", () => ({
  fetchCodexRateLimits: mocks.fetchCodexRateLimits,
}));

vi.mock("../claude-usage/claude-usage-service", () => ({
  fetchClaudeOauthUsageWithFallback: mocks.fetchClaudeOauthUsageWithFallback,
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

const codexWeeklyOnlyRateLimitsResponse = {
  rateLimits: {
    ...codexRateLimitsResponse.rateLimits,
    primary: codexRateLimitsResponse.rateLimits.secondary,
    secondary: null,
  },
  rateLimitsByLimitId: null,
};

const createCostResult = (updatedAt: string) => ({
  today: {
    usd: 1.2,
    tokens: 1200,
  },
  last30days: {
    usd: 12.3,
    tokens: 12300,
  },
  source: "exact" as const,
  sourceLabel: "test-source",
  confidence: "high" as const,
  updatedAt,
  reasonCode: null,
  reasonMessage: null,
  modelBreakdown: [],
  dailyBreakdown: [],
});

describe("createUsageDashboardService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fetchCodexRateLimits.mockResolvedValue(codexRateLimitsResponse);
    mocks.fetchClaudeOauthUsageWithFallback.mockResolvedValue({
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

  it("hides the session window when Codex only returns a weekly limit", async () => {
    mocks.fetchCodexRateLimits.mockResolvedValue(codexWeeklyOnlyRateLimitsResponse);
    const service = createUsageDashboardService({
      usageConfig: configDefaults.usage,
    });

    const provider = await service.getProviderSnapshot("codex");

    expect(provider.status).toBe("ok");
    expect(provider.windows).toEqual([
      expect.objectContaining({
        id: "weekly",
        utilizationPercent: 45,
      }),
    ]);
    expect(provider.capabilities.session).toBe(false);
    expect(provider.capabilities.weekly).toBe(true);
  });

  it("refreshes weekly usage when the Codex session limit disappears", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-02-24T00:00:00.000Z"));
      const service = createUsageDashboardService({
        cacheTtlMs: 1_000,
        usageConfig: configDefaults.usage,
      });

      const initial = await service.getDashboard({ provider: "codex" });
      expect(initial.providers[0]?.windows.some((window) => window.id === "session")).toBe(true);

      mocks.fetchCodexRateLimits.mockResolvedValue({
        ...codexWeeklyOnlyRateLimitsResponse,
        rateLimits: {
          ...codexWeeklyOnlyRateLimitsResponse.rateLimits,
          primary: {
            ...codexWeeklyOnlyRateLimitsResponse.rateLimits.primary,
            usedPercent: 46,
          },
        },
      });
      vi.setSystemTime(new Date("2026-02-24T00:00:01.001Z"));

      const refreshed = await service.getDashboard({ provider: "codex" });
      const provider = refreshed.providers[0];
      expect(provider?.status).toBe("ok");
      expect(provider?.fetchedAt).toBe("2026-02-24T00:00:01.001Z");
      expect(provider?.windows).toEqual([
        expect.objectContaining({
          id: "weekly",
          utilizationPercent: 46,
        }),
      ]);
      expect(provider?.capabilities.session).toBe(false);
      expect(mocks.fetchCodexRateLimits).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps codex billing cache for 10 minutes by default", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-02-24T00:00:00.000Z"));
      const getProviderCost = vi
        .fn()
        .mockResolvedValue(createCostResult("2026-02-24T00:00:00.000Z"));
      const service = createUsageDashboardService({
        usageConfig: configDefaults.usage,
        costProvider: {
          getProviderCost,
        },
      });

      await service.getProviderSnapshot("codex");
      expect(getProviderCost).toHaveBeenCalledTimes(1);

      vi.setSystemTime(new Date("2026-02-24T00:05:00.000Z"));
      await service.getProviderSnapshot("codex");
      expect(getProviderCost).toHaveBeenCalledTimes(1);

      vi.setSystemTime(new Date("2026-02-24T00:10:01.000Z"));
      await service.getProviderSnapshot("codex");
      expect(getProviderCost).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("reuses provider core snapshot until the ttl expires", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-02-24T00:00:00.000Z"));
      const service = createUsageDashboardService({
        cacheTtlMs: 1_000,
      });

      const first = await service.getDashboard({ provider: "codex" });
      expect(first.providers[0]?.fetchedAt).toBe("2026-02-24T00:00:00.000Z");
      expect(mocks.fetchCodexRateLimits).toHaveBeenCalledTimes(1);

      vi.setSystemTime(new Date("2026-02-24T00:00:00.999Z"));
      const cached = await service.getDashboard({ provider: "codex" });
      expect(cached.providers[0]?.fetchedAt).toBe("2026-02-24T00:00:00.000Z");
      expect(mocks.fetchCodexRateLimits).toHaveBeenCalledTimes(1);

      vi.setSystemTime(new Date("2026-02-24T00:00:01.001Z"));
      const refreshed = await service.getDashboard({ provider: "codex" });
      expect(refreshed.providers[0]?.fetchedAt).toBe("2026-02-24T00:00:01.001Z");
      expect(mocks.fetchCodexRateLimits).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("serves degraded cached data during provider backoff and retries after backoff expires", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-02-24T00:00:00.000Z"));
      const service = createUsageDashboardService({
        cacheTtlMs: 1_000,
        backoffMs: 5_000,
      });

      await service.getDashboard({ provider: "codex" });
      expect(mocks.fetchCodexRateLimits).toHaveBeenCalledTimes(1);

      mocks.fetchCodexRateLimits.mockRejectedValue(new Error("temporary upstream failure"));

      vi.setSystemTime(new Date("2026-02-24T00:00:01.001Z"));
      const degraded = await service.getDashboard({ provider: "codex" });
      expect(degraded.providers[0]?.status).toBe("degraded");
      expect(degraded.providers[0]?.issues.at(-1)?.message).toBe("Usage provider request failed");
      expect(mocks.fetchCodexRateLimits).toHaveBeenCalledTimes(2);

      vi.setSystemTime(new Date("2026-02-24T00:00:04.000Z"));
      const duringBackoff = await service.getDashboard({ provider: "codex" });
      expect(duringBackoff.providers[0]?.status).toBe("degraded");
      expect(duringBackoff.providers[0]?.issues.at(-1)?.message).toBe(
        "Using cached usage data while provider is recovering.",
      );
      expect(mocks.fetchCodexRateLimits).toHaveBeenCalledTimes(2);

      vi.setSystemTime(new Date("2026-02-24T00:00:06.002Z"));
      mocks.fetchCodexRateLimits.mockResolvedValue(codexRateLimitsResponse);
      const recovered = await service.getDashboard({ provider: "codex" });
      expect(recovered.providers[0]?.status).toBe("ok");
      expect(recovered.providers[0]?.fetchedAt).toBe("2026-02-24T00:00:06.002Z");
      expect(mocks.fetchCodexRateLimits).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });
});
