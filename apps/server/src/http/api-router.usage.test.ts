import { beforeEach, describe, expect, it, vi } from "vitest";

import { authHeaders, createTestContext } from "./api-router.test-helpers";

describe("createApiRouter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it("returns codex provider snapshot endpoint", async () => {
    const { api, getProviderSnapshot } = createTestContext();
    const res = await api.request("/codex/usage", {
      headers: authHeaders,
    });
    expect(res.status).toBe(200);
    expect(getProviderSnapshot).toHaveBeenCalledWith("codex", {
      forceRefresh: false,
      includeWindows: true,
    });
    const data = await res.json();
    expect(data.provider.providerId).toBe("codex");
  });

  it("returns provider billing endpoint", async () => {
    const { api, getProviderSnapshot } = createTestContext();
    const res = await api.request("/usage/billing?provider=claude", {
      headers: authHeaders,
    });
    expect(res.status).toBe(200);
    expect(getProviderSnapshot).toHaveBeenCalledWith("claude", {
      forceRefresh: false,
      includeWindows: false,
    });
    const data = await res.json();
    expect(data.provider.providerId).toBe("claude");
  });
});
