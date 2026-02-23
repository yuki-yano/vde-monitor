import { defaultConfig } from "@vde-monitor/shared";
import { describe, expect, it } from "vitest";

import { createUsageCostProvider } from "./cost-provider";
import type { UsagePricingSource, UsageTokenSource } from "./types";

const baseNow = new Date("2026-02-23T00:00:00.000Z");

const createPricingConfig = () => ({
  ...defaultConfig.usagePricing,
  providers: {
    ...defaultConfig.usagePricing.providers,
    codex: {
      ...defaultConfig.usagePricing.providers.codex,
      enabled: true,
    },
    claude: {
      ...defaultConfig.usagePricing.providers.claude,
      enabled: true,
    },
  },
});

const createTokenSource = (): UsageTokenSource => ({
  getProviderTokenUsage: async ({ providerId }) => ({
    ok: true,
    sourceLabel: providerId === "codex" ? "Codex session JSONL" : "Claude transcript JSONL",
    updatedAt: baseNow.toISOString(),
    models: [
      {
        modelId: providerId === "codex" ? "gpt-5.3-codex" : "claude-sonnet-4-6",
        today: {
          inputTokens: 1000,
          outputTokens: 500,
          cacheReadInputTokens: 200,
          cacheCreationInputTokens: 0,
          totalTokens: 1500,
        },
        last30days: {
          inputTokens: 4000,
          outputTokens: 2000,
          cacheReadInputTokens: 1000,
          cacheCreationInputTokens: 0,
          totalTokens: 6000,
        },
        daily: [
          {
            date: "2026-02-22",
            counters: {
              inputTokens: 1200,
              outputTokens: 600,
              cacheReadInputTokens: 300,
              cacheCreationInputTokens: 0,
              totalTokens: 1800,
            },
          },
          {
            date: "2026-02-23",
            counters: {
              inputTokens: 2800,
              outputTokens: 1400,
              cacheReadInputTokens: 700,
              cacheCreationInputTokens: 0,
              totalTokens: 4200,
            },
          },
        ],
      },
    ],
  }),
});

describe("createUsageCostProvider", () => {
  it("returns actual/high when all priced models are exact", async () => {
    const pricingSource: UsagePricingSource = {
      lookupModelPrice: async ({ modelId }) => ({
        ok: true,
        quote: {
          modelId,
          resolvedModelId: modelId,
          strategy: "exact",
          inputCostPerToken: 0.000001,
          outputCostPerToken: 0.00001,
          cacheReadInputCostPerToken: 0.0000005,
          cacheCreationInputCostPerToken: 0.000001,
          hasPrice: true,
          sourceLabel: "LiteLLM",
          updatedAt: baseNow.toISOString(),
          stale: false,
        },
      }),
    };
    const tokenSource = createTokenSource();
    const provider = createUsageCostProvider({
      pricingSource,
      tokenSources: {
        codex: tokenSource,
        claude: tokenSource,
      },
      pricingConfig: createPricingConfig(),
    });

    const result = await provider.getProviderCost({
      providerId: "codex",
      now: baseNow,
    });

    expect(result.source).toBe("actual");
    expect(result.confidence).toBe("high");
    expect(result.today.usd).not.toBeNull();
    expect(result.today.tokens).toBe(1500);
    expect(result.modelBreakdown).toHaveLength(1);
    expect(result.dailyBreakdown).toHaveLength(2);
    expect(result.dailyBreakdown[0]).toMatchObject({
      date: "2026-02-22",
      modelIds: ["gpt-5.3-codex"],
      totalTokens: 1800,
    });
  });

  it("returns estimated/medium for alias or prefix resolution", async () => {
    const pricingSource: UsagePricingSource = {
      lookupModelPrice: async ({ modelId }) => ({
        ok: true,
        quote: {
          modelId,
          resolvedModelId: `github_copilot/${modelId}`,
          strategy: "prefix",
          inputCostPerToken: 0.000001,
          outputCostPerToken: 0.00001,
          cacheReadInputCostPerToken: 0.0000005,
          cacheCreationInputCostPerToken: 0.000001,
          hasPrice: true,
          sourceLabel: "LiteLLM",
          updatedAt: baseNow.toISOString(),
          stale: false,
        },
      }),
    };
    const tokenSource = createTokenSource();
    const provider = createUsageCostProvider({
      pricingSource,
      tokenSources: {
        codex: tokenSource,
        claude: tokenSource,
      },
      pricingConfig: createPricingConfig(),
    });

    const result = await provider.getProviderCost({
      providerId: "codex",
      now: baseNow,
    });

    expect(result.source).toBe("estimated");
    expect(result.confidence).toBe("medium");
  });

  it("returns unavailable when pricing is disabled", async () => {
    const pricingConfig = createPricingConfig();
    pricingConfig.providers.codex.enabled = false;

    const pricingSource: UsagePricingSource = {
      lookupModelPrice: async () => ({
        ok: false,
        sourceLabel: null,
        updatedAt: null,
        reasonCode: "MODEL_MAPPING_MISSING",
        reasonMessage: "missing",
        stale: false,
      }),
    };
    const tokenSource = createTokenSource();
    const provider = createUsageCostProvider({
      pricingSource,
      tokenSources: {
        codex: tokenSource,
        claude: tokenSource,
      },
      pricingConfig,
    });

    const result = await provider.getProviderCost({
      providerId: "codex",
      now: baseNow,
    });

    expect(result.source).toBe("unavailable");
    expect(result.reasonCode).toBe("PRICING_NOT_CONFIGURED");
  });
});
