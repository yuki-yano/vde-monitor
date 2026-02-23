import type {
  UsageCostConfidence,
  UsageCostDataSource,
  UsageDailyCostItem,
  UsageModelCostItem,
} from "@vde-monitor/shared";

export type SupportedUsageCostProviderId = "codex" | "claude";
export type ResolveStrategy = "exact" | "prefix" | "alias" | "fallback" | "none";

export type UsageTokenCounters = {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
  totalTokens: number;
};

export type UsageTokenDailyEntry = {
  date: string;
  counters: UsageTokenCounters;
};

export type UsageTokenModelEntry = {
  modelId: string;
  today: UsageTokenCounters;
  last30days: UsageTokenCounters;
  daily: UsageTokenDailyEntry[];
};

export type UsageTokenUsageSuccess = {
  ok: true;
  sourceLabel: string;
  updatedAt: string;
  models: UsageTokenModelEntry[];
};

export type UsageTokenUsageFailure = {
  ok: false;
  sourceLabel: string | null;
  updatedAt: string | null;
  reasonCode: string;
  reasonMessage: string;
};

export type UsageTokenUsageResult = UsageTokenUsageSuccess | UsageTokenUsageFailure;

export type UsageTokenSource = {
  getProviderTokenUsage: (input: {
    providerId: SupportedUsageCostProviderId;
    now: Date;
  }) => Promise<UsageTokenUsageResult>;
};

export type ResolveModelInput = {
  providerId: SupportedUsageCostProviderId;
  modelId: string;
  availableModelIds: readonly string[];
};

export type ResolveModelResult = {
  resolvedModelId: string | null;
  strategy: ResolveStrategy;
};

export type ModelPriceQuote = {
  modelId: string;
  resolvedModelId: string;
  strategy: Exclude<ResolveStrategy, "none">;
  inputCostPerToken: number | null;
  outputCostPerToken: number | null;
  cacheReadInputCostPerToken: number | null;
  cacheCreationInputCostPerToken: number | null;
  hasPrice: boolean;
  sourceLabel: string;
  updatedAt: string;
  stale: boolean;
};

export type ModelPriceLookupSuccess = {
  ok: true;
  quote: ModelPriceQuote;
};

export type ModelPriceLookupFailure = {
  ok: false;
  sourceLabel: string | null;
  updatedAt: string | null;
  reasonCode: string;
  reasonMessage: string;
  stale: boolean;
};

export type ModelPriceLookupResult = ModelPriceLookupSuccess | ModelPriceLookupFailure;

export type UsagePricingSource = {
  lookupModelPrice: (input: {
    providerId: SupportedUsageCostProviderId;
    modelId: string;
    now: Date;
  }) => Promise<ModelPriceLookupResult>;
};

export type ProviderCostResult = {
  today: {
    usd: number | null;
    tokens: number | null;
  };
  last30days: {
    usd: number | null;
    tokens: number | null;
  };
  source: UsageCostDataSource;
  sourceLabel: string | null;
  confidence: UsageCostConfidence;
  updatedAt: string | null;
  reasonCode: string | null;
  reasonMessage: string | null;
  modelBreakdown: UsageModelCostItem[];
  dailyBreakdown: UsageDailyCostItem[];
};

export type UsageCostProvider = {
  getProviderCost: (input: {
    providerId: SupportedUsageCostProviderId;
    now: Date;
  }) => Promise<ProviderCostResult>;
};
