import { setImmediate } from "node:timers/promises";

import { configDefaults, usageProviderSnapshotSchema } from "@vde-monitor/shared";
import { afterEach, assert, beforeEach, describe, expect, it, vi } from "vitest";

import type { ProviderCostResult } from "../domain/usage-cost/types";
import { createUsageDashboardService } from "../domain/usage-dashboard/usage-dashboard-service";
import { UsageProviderError } from "../domain/usage-shared/usage-error";
import { authHeaders, createTestContext } from "./api-router.test-helpers";

const mocks = vi.hoisted(() => ({
  fetchCodexRateLimits: vi.fn(),
  fetchClaudeOauthUsageWithFallback: vi.fn(),
}));

vi.mock("../domain/codex-usage/codex-usage-service", () => ({
  fetchCodexRateLimits: mocks.fetchCodexRateLimits,
}));
vi.mock("../domain/claude-usage/claude-usage-service", () => ({
  fetchClaudeOauthUsageWithFallback: mocks.fetchClaudeOauthUsageWithFallback,
}));

const costResult: ProviderCostResult = {
  today: { usd: 1.2, tokens: 1200 },
  last30days: { usd: 12.3, tokens: 12300 },
  source: "actual",
  sourceLabel: "test-source",
  confidence: "high",
  updatedAt: "2026-09-13T10:00:00.000Z",
  reasonCode: null,
  reasonMessage: null,
  modelBreakdown: [],
  dailyBreakdown: [],
};

describe("createApiRouter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fetchCodexRateLimits.mockResolvedValue({
      rateLimits: {
        credits: { balance: "100" },
        primary: { usedPercent: 12, windowDurationMins: 300, resetsAt: null },
        secondary: { usedPercent: 45, windowDurationMins: 10_080, resetsAt: null },
      },
      rateLimitsByLimitId: null,
    });
    mocks.fetchClaudeOauthUsageWithFallback.mockResolvedValue({
      fiveHour: { utilizationPercent: 0, windowDurationMins: 300, resetsAt: null },
      sevenDay: {
        utilizationPercent: 30,
        windowDurationMins: 10_080,
        resetsAt: "2026-09-19T00:00:00.000Z",
      },
      modelWindows: [
        {
          modelLabel: "Fable",
          utilizationPercent: 42,
          windowDurationMins: 10_080,
          resetsAt: "2026-09-19T00:00:00.000Z",
        },
      ],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns usage dashboard snapshots", async () => {
    const { api, getDashboard } = createTestContext();
    const res = await api.request("/usage/dashboard?provider=codex", {
      headers: authHeaders,
    });

    expect(res.status).toBe(200);
    expect(getDashboard).toHaveBeenCalledWith({
      provider: "codex",
      forceRefresh: false,
    });
    const data = await res.json();
    expect(Array.isArray(data.providers)).toBe(true);
    expect(data.providers[0]?.providerId).toBe("codex");
  });

  it("rejects unsupported usage dashboard provider values", async () => {
    const { api, getDashboard } = createTestContext();
    const res = await api.request("/usage/dashboard?provider=cursor", {
      headers: authHeaders,
    });

    expect(res.status).toBe(400);
    expect(getDashboard).not.toHaveBeenCalled();
  });

  it("applies refresh throttle on usage dashboard", async () => {
    const { api } = createTestContext();
    const first = await api.request("/usage/dashboard?refresh=1", {
      headers: authHeaders,
    });
    expect(first.status).toBe(200);

    const second = await api.request("/usage/dashboard?refresh=1", {
      headers: authHeaders,
    });
    expect(second.status).toBe(200);

    const third = await api.request("/usage/dashboard?refresh=1", {
      headers: authHeaders,
    });
    expect(third.status).toBe(200);

    const fourth = await api.request("/usage/dashboard?refresh=1", {
      headers: authHeaders,
    });
    expect(fourth.status).toBe(429);
    const body = await fourth.json();
    expect(body.error.code).toBe("RATE_LIMIT");
  });

  it("does not share usage refresh throttle across dashboard and billing providers", async () => {
    const { api } = createTestContext();

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const dashboard = await api.request("/usage/dashboard?refresh=1", {
        headers: authHeaders,
      });
      expect(dashboard.status).toBe(200);
    }
    const dashboardLimited = await api.request("/usage/dashboard?refresh=1", {
      headers: authHeaders,
    });
    expect(dashboardLimited.status).toBe(429);

    const codexBilling = await api.request("/usage/billing?provider=codex&refresh=1", {
      headers: authHeaders,
    });
    expect(codexBilling.status).toBe(200);

    const claudeBilling = await api.request("/usage/billing?provider=claude&refresh=1", {
      headers: authHeaders,
    });
    expect(claudeBilling.status).toBe(200);
  });

  it("applies usage refresh throttle per billing provider", async () => {
    const { api } = createTestContext();

    const firstCodex = await api.request("/usage/billing?provider=codex&refresh=1", {
      headers: authHeaders,
    });
    expect(firstCodex.status).toBe(200);

    const secondCodex = await api.request("/usage/billing?provider=codex&refresh=1", {
      headers: authHeaders,
    });
    expect(secondCodex.status).toBe(200);

    const thirdCodex = await api.request("/usage/billing?provider=codex&refresh=1", {
      headers: authHeaders,
    });
    expect(thirdCodex.status).toBe(200);

    const fourthCodex = await api.request("/usage/billing?provider=codex&refresh=1", {
      headers: authHeaders,
    });
    expect(fourthCodex.status).toBe(429);
    const fourthCodexBody = await fourthCodex.json();
    expect(fourthCodexBody.error.code).toBe("RATE_LIMIT");

    const claude = await api.request("/usage/billing?provider=claude&refresh=1", {
      headers: authHeaders,
    });
    expect(claude.status).toBe(200);
  });

  it("applies usage refresh throttle per provider usage endpoint", async () => {
    const { api } = createTestContext();

    const firstCodex = await api.request("/codex/usage?refresh=1", {
      headers: authHeaders,
    });
    expect(firstCodex.status).toBe(200);

    const secondCodex = await api.request("/codex/usage?refresh=1", {
      headers: authHeaders,
    });
    expect(secondCodex.status).toBe(200);

    const thirdCodex = await api.request("/codex/usage?refresh=1", {
      headers: authHeaders,
    });
    expect(thirdCodex.status).toBe(200);

    const fourthCodex = await api.request("/codex/usage?refresh=1", {
      headers: authHeaders,
    });
    expect(fourthCodex.status).toBe(429);
    const fourthCodexBody = await fourthCodex.json();
    expect(fourthCodexBody.error.code).toBe("RATE_LIMIT");

    const claude = await api.request("/claude/usage?refresh=1", {
      headers: authHeaders,
    });
    expect(claude.status).toBe(200);
  });

  it("returns global usage state timeline", async () => {
    const { api, getGlobalStateTimeline } = createTestContext();
    const res = await api.request("/usage/state-timeline?range=3d&limit=25", {
      headers: authHeaders,
    });

    expect(res.status).toBe(200);
    expect(getGlobalStateTimeline).toHaveBeenCalledWith("3d");
    const data = await res.json();
    expect(data.timeline.paneId).toBe("global");
    const removedRankingKey = "repo" + "Ranking";
    expect(data[removedRankingKey]).toBeUndefined();
    expect(Object.keys(data).sort()).toEqual([
      "activePaneCount",
      "fetchedAt",
      "paneCount",
      "timeline",
    ]);
  });

  it("ignores usage state timeline limit query as no-op", async () => {
    const { api, getGlobalStateTimeline } = createTestContext();
    const res = await api.request("/usage/state-timeline?range=3d&limit=not-a-number", {
      headers: authHeaders,
    });

    expect(res.status).toBe(200);
    expect(getGlobalStateTimeline).toHaveBeenCalledWith("3d");
  });

  it("returns repository activity for the selected range", async () => {
    const { api, getRepositoryActivity } = createTestContext();
    getRepositoryActivity.mockReturnValueOnce({
      range: "7d",
      rangeStart: "2026-02-18T10:00:00.000Z",
      rangeEnd: "2026-02-25T10:00:00.000Z",
      coverage: {
        status: "partial",
        trackingStartedAt: "2026-02-20T10:00:00.000Z",
        gapDurationMs: 60_000,
        unattributedRunningMs: 30_000,
        unattributedCompletedRunCount: 2,
        unverifiedCompletedRunCount: 1,
      },
      items: [
        {
          repoKey: "/repo/a",
          repoRoot: "/repo/a",
          repoName: "a",
          activeTimeMs: 20_000,
          agentTimeMs: 30_000,
          completedRunCount: 2,
          lastActiveAt: "2026-02-25T09:59:00.000Z",
        },
      ],
      fetchedAt: "2026-02-25T10:00:00.000Z",
    });

    const res = await api.request("/usage/repository-activity?range=7d", {
      headers: authHeaders,
    });

    expect(res.status).toBe(200);
    expect(getRepositoryActivity).toHaveBeenCalledWith("7d");
    expect(await res.json()).toMatchObject({
      range: "7d",
      items: [expect.objectContaining({ repoRoot: "/repo/a", completedRunCount: 2 })],
    });
  });

  it("defaults repository activity to 24h and validates the range", async () => {
    const { api, getRepositoryActivity } = createTestContext();

    const defaultRange = await api.request("/usage/repository-activity", { headers: authHeaders });
    const invalidRange = await api.request("/usage/repository-activity?range=2d", {
      headers: authHeaders,
    });

    expect(defaultRange.status).toBe(200);
    expect(getRepositoryActivity).toHaveBeenCalledWith("24h");
    expect(invalidRange.status).toBe(400);
  });

  it.each(["claude", "codex"] as const)(
    "returns %s core provider snapshot endpoint",
    async (providerId) => {
      const { api, getProviderSnapshot, getProviderBillingSnapshot } = createTestContext();
      const res = await api.request(`/${providerId}/usage`, {
        headers: authHeaders,
      });
      expect(res.status).toBe(200);
      expect(getProviderSnapshot).toHaveBeenCalledWith(providerId, {
        forceRefresh: false,
        includeWindows: true,
      });
      const data = await res.json();
      expect(data.provider.providerId).toBe(providerId);
      expect(getProviderBillingSnapshot).not.toHaveBeenCalled();
    },
  );

  it("returns provider billing endpoint", async () => {
    const { api, getProviderSnapshot, getProviderBillingSnapshot } = createTestContext();
    const res = await api.request("/usage/billing?provider=claude", {
      headers: authHeaders,
    });
    expect(res.status).toBe(200);
    expect(getProviderBillingSnapshot).toHaveBeenCalledWith("claude", {
      forceRefresh: false,
    });
    const data = await res.json();
    expect(data.provider.providerId).toBe("claude");
    expect(data.provider.windows).toEqual([]);
    expect(getProviderSnapshot).not.toHaveBeenCalled();
  });

  describe.each(["claude", "codex"] as const)("%s usage and billing separation", (providerId) => {
    const createUsageContext = () => {
      const getProviderCost = vi.fn().mockResolvedValue(costResult);
      const service = createUsageDashboardService({
        cacheTtlMs: 600_000,
        billingCacheTtlMs: 180_000,
        costProvider: { getProviderCost },
        usageConfig: {
          ...configDefaults.usage,
          session: { providers: { claude: { enabled: true }, codex: { enabled: true } } },
        },
      });
      return { ...createTestContext({}, service), service, getProviderCost };
    };

    it.each(["missing", "expired"])(
      "returns cached usage without calculating costs when billing cache is %s",
      async (cacheState) => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-09-13T10:00:00.000Z"));
        const { api, getProviderCost } = createUsageContext();
        const dashboard = await api.request(`/usage/dashboard?provider=${providerId}`, {
          headers: authHeaders,
        });
        const core = (await dashboard.json()).providers[0];
        expect(core.status).toBe("ok");
        expect(getProviderCost).not.toHaveBeenCalled();
        if (cacheState === "expired") {
          await api.request(`/usage/billing?provider=${providerId}`, { headers: authHeaders });
          expect(getProviderCost).toHaveBeenCalledTimes(1);
          vi.setSystemTime(new Date("2026-09-13T10:03:00.001Z"));
        }
        getProviderCost.mockClear();
        const response = await api.request(`/${providerId}/usage`, { headers: authHeaders });
        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.provider).toEqual(core);
        expect(body.fetchedAt).toBe(new Date().toISOString());
        expect(usageProviderSnapshotSchema.safeParse(body.provider).success).toBe(true);
        expect(getProviderCost).not.toHaveBeenCalled();
        expect(mocks.fetchClaudeOauthUsageWithFallback).toHaveBeenCalledTimes(
          providerId === "claude" ? 1 : 0,
        );
        expect(mocks.fetchCodexRateLimits).toHaveBeenCalledTimes(providerId === "codex" ? 1 : 0);
        if (providerId === "claude") {
          expect(body.provider.windows).toMatchObject([
            { id: "session", utilizationPercent: 0, resetsAt: null },
            { id: "weekly", utilizationPercent: 30 },
            { id: "model", title: "Fable Weekly", utilizationPercent: 42 },
          ]);
        } else {
          expect(body.provider.billing.creditsLeft).toBe(100);
        }
      },
    );

    it("responds before another billing request's cost promise resolves", async () => {
      const { api, service, getProviderCost } = createUsageContext();
      const core = await service.getProviderSnapshot(providerId);
      let resolveCost!: (cost: ProviderCostResult) => void;
      const cost = new Promise<ProviderCostResult>((resolve) => {
        resolveCost = resolve;
      });
      let markStarted!: () => void;
      const started = new Promise<void>((resolve) => {
        markStarted = resolve;
      });
      getProviderCost.mockImplementation(() => {
        markStarted();
        return cost;
      });
      let billingCompleted = false;
      const billingRequest = Promise.resolve(
        api.request(`/usage/billing?provider=${providerId}`, { headers: authHeaders }),
      ).then((response) => {
        billingCompleted = true;
        return response;
      });
      await started;
      try {
        // A single event-loop turn drains the in-memory HTTP request's microtasks.
        // The cost promise remains unresolved; no elapsed-time threshold is involved.
        const response = await Promise.race([
          api.request(`/${providerId}/usage`, { headers: authHeaders }),
          setImmediate(null),
        ]);
        assert(response != null, "Usage must finish while billing is still pending");
        expect(response.status).toBe(200);
        expect((await response.json()).provider).toEqual(core);
        expect(billingCompleted).toBe(false);
        expect(getProviderCost).toHaveBeenCalledTimes(1);
      } finally {
        resolveCost(costResult);
      }
      const billingResponse = await billingRequest;
      expect(billingResponse.status).toBe(200);
      const billing = (await billingResponse.json()).provider;
      expect(usageProviderSnapshotSchema.safeParse(billing).success).toBe(true);
      expect(billing).toMatchObject({ windows: [], billing: { costTodayUsd: 1.2 } });
      await api.request(`/usage/billing?provider=${providerId}`, { headers: authHeaders });
      expect(getProviderCost).toHaveBeenCalledTimes(1);
      await api.request(`/usage/billing?provider=${providerId}&refresh=1`, {
        headers: authHeaders,
      });
      expect(getProviderCost).toHaveBeenCalledTimes(2);
    });

    it("preserves degraded/error states and absent windows in HTTP responses", async () => {
      const { api, service, getProviderCost } = createUsageContext();
      const core = await service.getProviderSnapshot(providerId);
      const fetchUsage =
        providerId === "claude"
          ? mocks.fetchClaudeOauthUsageWithFallback
          : mocks.fetchCodexRateLimits;
      fetchUsage.mockRejectedValue(
        new UsageProviderError("UPSTREAM_UNAVAILABLE", "upstream unavailable"),
      );
      const degraded = await api.request(`/${providerId}/usage?refresh=1`, {
        headers: authHeaders,
      });
      expect(degraded.status).toBe(200);
      expect((await degraded.json()).provider).toEqual({
        ...core,
        status: "degraded",
        issues: [
          { code: "UPSTREAM_UNAVAILABLE", message: "upstream unavailable", severity: "error" },
        ],
      });
      expect(getProviderCost).not.toHaveBeenCalled();
      const cold = createUsageContext();
      const failed = await cold.api.request(`/${providerId}/usage`, { headers: authHeaders });
      expect(failed.status).toBe(200);
      expect((await failed.json()).provider).toMatchObject({
        status: "error",
        windows: [],
        issues: [{ code: "UPSTREAM_UNAVAILABLE" }],
      });
      expect(cold.getProviderCost).not.toHaveBeenCalled();
    });

    it("preserves auth, window filtering, and the provider refresh limit", async () => {
      const { api, getProviderSnapshot, getProviderBillingSnapshot } = createTestContext();
      for (const headers of [undefined, { Authorization: "Bearer invalid" }]) {
        expect((await api.request(`/${providerId}/usage`, { headers })).status).toBe(401);
        expect(
          (await api.request(`/usage/billing?provider=${providerId}`, { headers })).status,
        ).toBe(401);
      }
      expect(getProviderSnapshot).not.toHaveBeenCalled();
      expect(getProviderBillingSnapshot).not.toHaveBeenCalled();
      for (let i = 0; i < 3; i += 1) {
        expect(
          (
            await api.request(`/${providerId}/usage?refresh=1&includeWindows=false`, {
              headers: authHeaders,
            })
          ).status,
        ).toBe(200);
      }
      expect(getProviderSnapshot).toHaveBeenLastCalledWith(providerId, {
        forceRefresh: true,
        includeWindows: false,
      });
      expect(
        (await api.request(`/${providerId}/usage?refresh=1`, { headers: authHeaders })).status,
      ).toBe(429);
      expect(getProviderSnapshot).toHaveBeenCalledTimes(3);
      expect((await api.request(`/${providerId}/usage`, { headers: authHeaders })).status).toBe(
        200,
      );
      expect(
        (
          await api.request(`/usage/billing?provider=${providerId}&refresh=1`, {
            headers: authHeaders,
          })
        ).status,
      ).toBe(200);
      expect(
        (await api.request("/usage/dashboard?refresh=1", { headers: authHeaders })).status,
      ).toBe(200);
    });
  });
});
