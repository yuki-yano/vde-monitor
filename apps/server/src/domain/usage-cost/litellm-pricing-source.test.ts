import { describe, expect, it, vi } from "vitest";

import { LiteLLMPricingSource } from "./litellm-pricing-source";

const createFetchResponse = (payload: unknown) =>
  new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      "content-type": "application/json",
    },
  });

describe("LiteLLMPricingSource", () => {
  it("resolves prefixed model pricing", async () => {
    const fetchImpl = vi.fn(async () =>
      createFetchResponse({
        "github_copilot/gpt-5.3-codex": {
          input_cost_per_token: 0.000001,
          output_cost_per_token: 0.00001,
          cache_read_input_token_cost: 0.0000005,
        },
      }),
    );
    const source = new LiteLLMPricingSource({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      ttlMs: 24 * 60 * 60 * 1000,
      staleMaxAgeMs: 7 * 24 * 60 * 60 * 1000,
    });

    const result = await source.lookupModelPrice({
      providerId: "codex",
      modelId: "gpt-5.3-codex",
      now: new Date("2026-02-23T00:00:00.000Z"),
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.quote.strategy).toBe("prefix");
      expect(result.quote.hasPrice).toBe(true);
      expect(result.quote.sourceLabel).toBe("LiteLLM");
    }
  });

  it("returns MODEL_PRICE_MISSING when price row has no unit costs", async () => {
    const fetchImpl = vi.fn(async () =>
      createFetchResponse({
        "github_copilot/gpt-5.3-codex": {},
      }),
    );
    const source = new LiteLLMPricingSource({
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const result = await source.lookupModelPrice({
      providerId: "codex",
      modelId: "gpt-5.3-codex",
      now: new Date("2026-02-23T00:00:00.000Z"),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reasonCode).toBe("MODEL_PRICE_MISSING");
    }
  });

  it("falls back to closest older similar model when latest model has no price", async () => {
    const fetchImpl = vi.fn(async () =>
      createFetchResponse({
        "gpt-5.3-codex": {},
        "gpt-5.2-codex": {
          input_cost_per_token: 0.000001,
          output_cost_per_token: 0.00001,
        },
        "gpt-5.1-codex-mini": {
          input_cost_per_token: 0.0000002,
          output_cost_per_token: 0.000002,
        },
      }),
    );
    const source = new LiteLLMPricingSource({
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const result = await source.lookupModelPrice({
      providerId: "codex",
      modelId: "gpt-5.3-codex",
      now: new Date("2026-02-23T00:00:00.000Z"),
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.quote.strategy).toBe("fallback");
      expect(result.quote.resolvedModelId).toBe("gpt-5.2-codex");
      expect(result.quote.hasPrice).toBe(true);
    }
  });

  it("prefers unprefixed fallback model over provider-prefixed variant", async () => {
    const fetchImpl = vi.fn(async () =>
      createFetchResponse({
        "azure/gpt-5.3-codex": {},
        "azure/gpt-5.2-codex": {
          input_cost_per_token: 0.00000175,
          output_cost_per_token: 0.000014,
        },
        "gpt-5.2-codex": {
          input_cost_per_token: 0.00000175,
          output_cost_per_token: 0.000014,
        },
      }),
    );
    const source = new LiteLLMPricingSource({
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const result = await source.lookupModelPrice({
      providerId: "codex",
      modelId: "azure/gpt-5.3-codex",
      now: new Date("2026-02-23T00:00:00.000Z"),
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.quote.strategy).toBe("fallback");
      expect(result.quote.resolvedModelId).toBe("gpt-5.2-codex");
    }
  });

  it("uses stale cache when refresh fails within staleMaxAge", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        createFetchResponse({
          "github_copilot/gpt-5.3-codex": {
            input_cost_per_token: 0.000001,
          },
        }),
      )
      .mockRejectedValueOnce(new Error("network error"));
    const source = new LiteLLMPricingSource({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      ttlMs: 10,
      staleMaxAgeMs: 1_000,
    });

    const first = await source.lookupModelPrice({
      providerId: "codex",
      modelId: "gpt-5.3-codex",
      now: new Date("2026-02-23T00:00:00.000Z"),
    });
    expect(first.ok).toBe(true);

    const stale = await source.lookupModelPrice({
      providerId: "codex",
      modelId: "gpt-5.3-codex",
      now: new Date("2026-02-23T00:00:00.020Z"),
    });
    expect(stale.ok).toBe(true);
    if (stale.ok) {
      expect(stale.quote.stale).toBe(true);
      expect(stale.quote.sourceLabel).toBe("LiteLLM (stale-cache)");
    }
  });

  it("returns PRICING_CACHE_TOO_OLD when stale cache exceeds max age", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        createFetchResponse({
          "github_copilot/gpt-5.3-codex": {
            input_cost_per_token: 0.000001,
          },
        }),
      )
      .mockRejectedValueOnce(new Error("network error"));
    const source = new LiteLLMPricingSource({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      ttlMs: 10,
      staleMaxAgeMs: 1_000,
    });

    await source.lookupModelPrice({
      providerId: "codex",
      modelId: "gpt-5.3-codex",
      now: new Date("2026-02-23T00:00:00.000Z"),
    });

    const tooOld = await source.lookupModelPrice({
      providerId: "codex",
      modelId: "gpt-5.3-codex",
      now: new Date("2026-02-23T00:00:02.000Z"),
    });
    expect(tooOld.ok).toBe(false);
    if (!tooOld.ok) {
      expect(tooOld.reasonCode).toBe("PRICING_CACHE_TOO_OLD");
    }
  });
});
