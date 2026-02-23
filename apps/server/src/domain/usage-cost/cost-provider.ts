import type { UsagePricingConfig } from "@vde-monitor/shared";

import type {
  ModelPriceQuote,
  ProviderCostResult,
  ResolveStrategy,
  SupportedUsageCostProviderId,
  UsageCostProvider,
  UsagePricingSource,
  UsageTokenCounters,
  UsageTokenSource,
} from "./types";

export type UsageCostProviderOptions = {
  pricingSource: UsagePricingSource;
  tokenSources: Record<SupportedUsageCostProviderId, UsageTokenSource>;
  pricingConfig: UsagePricingConfig;
};

const createUnavailable = (input?: {
  sourceLabel?: string | null;
  updatedAt?: string | null;
  reasonCode?: string | null;
  reasonMessage?: string | null;
  modelBreakdown?: ProviderCostResult["modelBreakdown"];
  dailyBreakdown?: ProviderCostResult["dailyBreakdown"];
}): ProviderCostResult => ({
  today: {
    usd: null,
    tokens: null,
  },
  last30days: {
    usd: null,
    tokens: null,
  },
  source: "unavailable",
  sourceLabel: input?.sourceLabel ?? null,
  confidence: null,
  updatedAt: input?.updatedAt ?? null,
  reasonCode: input?.reasonCode ?? null,
  reasonMessage: input?.reasonMessage ?? null,
  modelBreakdown: input?.modelBreakdown ?? [],
  dailyBreakdown: input?.dailyBreakdown ?? [],
});

const roundUsd = (value: number) => Math.round(value * 1_000_000) / 1_000_000;

const calculateCounterCost = (usage: UsageTokenCounters, quote: ModelPriceQuote) => {
  const inputCost = usage.inputTokens * (quote.inputCostPerToken ?? 0);
  const outputCost = usage.outputTokens * (quote.outputCostPerToken ?? 0);
  const cacheReadUnit = quote.cacheReadInputCostPerToken ?? quote.inputCostPerToken ?? 0;
  const cacheCreationUnit = quote.cacheCreationInputCostPerToken ?? quote.inputCostPerToken ?? 0;
  const cacheReadCost = usage.cacheReadInputTokens * cacheReadUnit;
  const cacheCreationCost = usage.cacheCreationInputTokens * cacheCreationUnit;
  return inputCost + outputCost + cacheReadCost + cacheCreationCost;
};

type MutableDailyCostRow = {
  date: string;
  modelIds: Set<string>;
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
  totalTokens: number;
  usd: number;
};

export const createUsageCostProvider = (options: UsageCostProviderOptions): UsageCostProvider => {
  const getProviderCost: UsageCostProvider["getProviderCost"] = async ({ providerId, now }) => {
    if (!options.pricingConfig.providers[providerId].enabled) {
      return createUnavailable({
        reasonCode: "PRICING_NOT_CONFIGURED",
        reasonMessage: "Cost calculation is disabled for this provider",
      });
    }

    const tokenSource = options.tokenSources[providerId];
    const tokenUsage = await tokenSource.getProviderTokenUsage({ providerId, now });
    if (!tokenUsage.ok) {
      return createUnavailable({
        sourceLabel: tokenUsage.sourceLabel,
        updatedAt: tokenUsage.updatedAt,
        reasonCode: tokenUsage.reasonCode,
        reasonMessage: tokenUsage.reasonMessage,
      });
    }
    if (tokenUsage.models.length === 0) {
      return createUnavailable({
        sourceLabel: tokenUsage.sourceLabel,
        updatedAt: tokenUsage.updatedAt,
        reasonCode: "COST_SOURCE_UNAVAILABLE",
        reasonMessage: "Token usage data is not available yet",
      });
    }

    let todayUsd = 0;
    let todayTokens = 0;
    let last30daysUsd = 0;
    let last30daysTokens = 0;
    const modelBreakdown: ProviderCostResult["modelBreakdown"] = [];
    const dailyBreakdownMap = new Map<string, MutableDailyCostRow>();
    const strategies = new Set<ResolveStrategy>();
    const sourceLabels = new Set<string>();
    const updatedAtValues = new Set<string>();
    const failedReasons = new Set<string>();

    for (const modelUsage of tokenUsage.models) {
      const lookupResult = await options.pricingSource.lookupModelPrice({
        providerId,
        modelId: modelUsage.modelId,
        now,
      });

      if (!lookupResult.ok) {
        failedReasons.add(lookupResult.reasonCode);
        continue;
      }

      const quote = lookupResult.quote;
      strategies.add(quote.strategy);
      sourceLabels.add(quote.sourceLabel);
      updatedAtValues.add(quote.updatedAt);

      const todayCost = calculateCounterCost(modelUsage.today, quote);
      const last30daysCost = calculateCounterCost(modelUsage.last30days, quote);

      todayUsd += todayCost;
      todayTokens += modelUsage.today.totalTokens;
      last30daysUsd += last30daysCost;
      last30daysTokens += modelUsage.last30days.totalTokens;

      const dailyRows = Array.isArray(modelUsage.daily) ? modelUsage.daily : [];
      for (const dailyUsage of dailyRows) {
        if (
          !dailyUsage ||
          typeof dailyUsage.date !== "string" ||
          !dailyUsage.counters ||
          typeof dailyUsage.counters !== "object"
        ) {
          continue;
        }
        const date = dailyUsage.date;
        const counters = dailyUsage.counters;
        const row =
          dailyBreakdownMap.get(date) ??
          (() => {
            const created: MutableDailyCostRow = {
              date,
              modelIds: new Set<string>(),
              inputTokens: 0,
              outputTokens: 0,
              cacheCreationInputTokens: 0,
              cacheReadInputTokens: 0,
              totalTokens: 0,
              usd: 0,
            };
            dailyBreakdownMap.set(date, created);
            return created;
          })();

        row.modelIds.add(modelUsage.modelId);
        row.inputTokens += counters.inputTokens;
        row.outputTokens += counters.outputTokens;
        row.cacheCreationInputTokens += counters.cacheCreationInputTokens;
        row.cacheReadInputTokens += counters.cacheReadInputTokens;
        row.totalTokens += counters.totalTokens;
        row.usd += calculateCounterCost(counters, quote);
      }

      modelBreakdown.push({
        modelId: modelUsage.modelId,
        modelLabel: modelUsage.modelId,
        resolvedModelId: quote.resolvedModelId,
        resolveStrategy: quote.strategy,
        tokens: modelUsage.last30days.totalTokens,
        usd: roundUsd(last30daysCost),
        source: quote.strategy === "exact" ? "actual" : "estimated",
      });
    }

    if (modelBreakdown.length === 0) {
      const firstReason = failedReasons.values().next().value;
      return createUnavailable({
        sourceLabel: tokenUsage.sourceLabel,
        updatedAt: tokenUsage.updatedAt,
        reasonCode: firstReason ?? "MODEL_MAPPING_MISSING",
        reasonMessage: "Model price is unavailable in pricing source",
      });
    }

    const hasOnlyExact =
      !strategies.has("prefix") && !strategies.has("alias") && !strategies.has("fallback");
    const hasFailedModels = failedReasons.size > 0;
    const source = hasOnlyExact && !hasFailedModels ? "actual" : "estimated";
    const confidence =
      hasOnlyExact && !hasFailedModels ? "high" : hasFailedModels ? "low" : "medium";
    const sourceLabel =
      sourceLabels.size > 0
        ? Array.from(sourceLabels).join(" + ")
        : (tokenUsage.sourceLabel ?? "Cost source");
    const sortedUpdatedAt = Array.from(updatedAtValues).sort(
      (left, right) => Date.parse(right) - Date.parse(left),
    );
    const updatedAt = sortedUpdatedAt[0] ?? tokenUsage.updatedAt ?? null;
    const dailyBreakdown = Array.from(dailyBreakdownMap.values())
      .sort((left, right) => left.date.localeCompare(right.date))
      .map((daily) => ({
        date: daily.date,
        modelIds: Array.from(daily.modelIds).sort(),
        inputTokens: daily.inputTokens,
        outputTokens: daily.outputTokens,
        cacheCreationInputTokens: daily.cacheCreationInputTokens,
        cacheReadInputTokens: daily.cacheReadInputTokens,
        totalTokens: daily.totalTokens,
        usd: roundUsd(daily.usd),
      }));

    return {
      today: {
        usd: roundUsd(todayUsd),
        tokens: todayTokens,
      },
      last30days: {
        usd: roundUsd(last30daysUsd),
        tokens: last30daysTokens,
      },
      source,
      sourceLabel,
      confidence,
      updatedAt,
      reasonCode: hasFailedModels ? "MODEL_MAPPING_MISSING" : null,
      reasonMessage: hasFailedModels ? "Some models could not be priced and were excluded" : null,
      modelBreakdown,
      dailyBreakdown,
    };
  };

  return {
    getProviderCost,
  };
};
