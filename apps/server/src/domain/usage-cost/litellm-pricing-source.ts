import { resolveModelId } from "./model-resolver";
import { PROVIDER_PREFIX_CANDIDATES } from "./provider-alias";
import type { ModelPriceLookupFailure, ModelPriceLookupResult, UsagePricingSource } from "./types";

type LiteLLMModelPricing = {
  input_cost_per_token?: unknown;
  output_cost_per_token?: unknown;
  cache_read_input_token_cost?: unknown;
  cache_creation_input_token_cost?: unknown;
};

type PricingCache = {
  lastSuccessAtMs: number;
  models: Record<string, LiteLLMModelPricing>;
};

type PricingDataResult =
  | { ok: true; cache: PricingCache; stale: boolean }
  | {
      ok: false;
      sourceLabel: string | null;
      updatedAt: string | null;
      reasonCode: string;
      reasonMessage: string;
      stale: boolean;
    };

export type LiteLLMPricingSourceOptions = {
  url?: string;
  fetchImpl?: typeof fetch;
  ttlMs?: number;
  staleMaxAgeMs?: number;
};

const DEFAULT_PRICING_URL =
  "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json";
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_STALE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const SOURCE_LABEL = "LiteLLM";
const STALE_SOURCE_LABEL = "LiteLLM (stale-cache)";
const VERSION_TOKEN_PATTERN = /\d+(?:\.\d+)*/;

const toNullableNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const normalizePricingMap = (input: unknown): Record<string, LiteLLMModelPricing> => {
  if (!input || typeof input !== "object") {
    return {};
  }

  const entries: [string, LiteLLMModelPricing][] = [];
  for (const [modelId, pricing] of Object.entries(input)) {
    if (typeof modelId !== "string" || !pricing || typeof pricing !== "object") {
      continue;
    }
    entries.push([modelId, pricing as LiteLLMModelPricing]);
  }
  return Object.fromEntries(entries);
};

const toFailure = (failure: Omit<ModelPriceLookupFailure, "ok">): ModelPriceLookupFailure => ({
  ok: false,
  ...failure,
});

type ParsedPriceRow = {
  inputCostPerToken: number | null;
  outputCostPerToken: number | null;
  cacheReadInputCostPerToken: number | null;
  cacheCreationInputCostPerToken: number | null;
  hasPrice: boolean;
};

const parsePriceRow = (row: LiteLLMModelPricing | null | undefined): ParsedPriceRow | null => {
  if (!row) {
    return null;
  }
  const inputCostPerToken = toNullableNumber(row.input_cost_per_token);
  const outputCostPerToken = toNullableNumber(row.output_cost_per_token);
  const cacheReadInputCostPerToken = toNullableNumber(row.cache_read_input_token_cost);
  const cacheCreationInputCostPerToken = toNullableNumber(row.cache_creation_input_token_cost);
  const hasPrice =
    inputCostPerToken != null ||
    outputCostPerToken != null ||
    cacheReadInputCostPerToken != null ||
    cacheCreationInputCostPerToken != null;
  return {
    inputCostPerToken,
    outputCostPerToken,
    cacheReadInputCostPerToken,
    cacheCreationInputCostPerToken,
    hasPrice,
  };
};

const splitProviderPrefix = ({
  providerId,
  modelId,
}: {
  providerId: "codex" | "claude";
  modelId: string;
}) => {
  const prefixes = PROVIDER_PREFIX_CANDIDATES[providerId];
  for (const prefix of prefixes) {
    if (modelId.startsWith(prefix)) {
      return {
        prefix,
        bareModelId: modelId.slice(prefix.length),
      };
    }
  }
  return {
    prefix: null,
    bareModelId: modelId,
  };
};

const normalizeModelSkeleton = (modelId: string) => modelId.replace(VERSION_TOKEN_PATTERN, "{v}");

const parseModelVersion = (modelId: string): number[] | null => {
  const matched = modelId.match(VERSION_TOKEN_PATTERN);
  if (!matched) {
    return null;
  }
  const version = matched[0]
    .split(".")
    .map((part) => Number(part))
    .filter((part) => Number.isFinite(part));
  return version.length > 0 ? version : null;
};

const compareVersion = (left: number[], right: number[]) => {
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const leftPart = left[index] ?? -1;
    const rightPart = right[index] ?? -1;
    if (leftPart === rightPart) {
      continue;
    }
    return leftPart > rightPart ? 1 : -1;
  }
  return 0;
};

const inferClosestOlderModelWithPrice = ({
  providerId,
  modelId,
  availableModelIds,
  pricingRows,
}: {
  providerId: "codex" | "claude";
  modelId: string;
  availableModelIds: readonly string[];
  pricingRows: Record<string, LiteLLMModelPricing>;
}): string | null => {
  const target = splitProviderPrefix({
    providerId,
    modelId,
  });
  const targetVersion = parseModelVersion(target.bareModelId);
  if (!targetVersion) {
    return null;
  }
  const targetSkeleton = normalizeModelSkeleton(target.bareModelId);

  let best: {
    modelId: string;
    version: number[];
    prefixScore: number;
    hasSamePrefix: boolean;
  } | null = null;

  for (const candidateModelId of availableModelIds) {
    const candidateRow = parsePriceRow(pricingRows[candidateModelId]);
    if (!candidateRow?.hasPrice) {
      continue;
    }
    const candidate = splitProviderPrefix({
      providerId,
      modelId: candidateModelId,
    });
    if (normalizeModelSkeleton(candidate.bareModelId) !== targetSkeleton) {
      continue;
    }
    const candidateVersion = parseModelVersion(candidate.bareModelId);
    if (!candidateVersion) {
      continue;
    }
    if (compareVersion(candidateVersion, targetVersion) >= 0) {
      continue;
    }

    const hasSamePrefix = candidate.prefix === target.prefix;
    const prefixScore = candidate.prefix == null ? 2 : hasSamePrefix ? 1 : 0;
    if (!best) {
      best = {
        modelId: candidateModelId,
        version: candidateVersion,
        prefixScore,
        hasSamePrefix,
      };
      continue;
    }

    const compareToBest = compareVersion(candidateVersion, best.version);
    if (
      compareToBest > 0 ||
      (compareToBest === 0 &&
        (prefixScore > best.prefixScore ||
          (prefixScore === best.prefixScore && hasSamePrefix && !best.hasSamePrefix)))
    ) {
      best = {
        modelId: candidateModelId,
        version: candidateVersion,
        prefixScore,
        hasSamePrefix,
      };
    }
  }

  return best?.modelId ?? null;
};

export class LiteLLMPricingSource implements UsagePricingSource {
  private readonly url: string;
  private readonly fetchImpl: typeof fetch;
  private readonly ttlMs: number;
  private readonly staleMaxAgeMs: number;
  private cache: PricingCache | null = null;

  constructor(options: LiteLLMPricingSourceOptions = {}) {
    this.url = options.url ?? DEFAULT_PRICING_URL;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    this.staleMaxAgeMs = options.staleMaxAgeMs ?? DEFAULT_STALE_MAX_AGE_MS;
  }

  private isFresh = (nowMs: number) =>
    this.cache != null && nowMs - this.cache.lastSuccessAtMs < this.ttlMs;

  private toCacheAgeMs = (nowMs: number) =>
    this.cache == null ? Number.POSITIVE_INFINITY : nowMs - this.cache.lastSuccessAtMs;

  private toCacheUpdatedAtIso = () =>
    this.cache == null ? null : new Date(this.cache.lastSuccessAtMs).toISOString();

  private loadPricingData = async (nowMs: number): Promise<PricingDataResult> => {
    if (this.isFresh(nowMs) && this.cache) {
      return {
        ok: true,
        cache: this.cache,
        stale: false,
      };
    }

    try {
      const response = await this.fetchImpl(this.url);
      if (!response.ok) {
        throw new Error(`failed to fetch pricing: ${response.status} ${response.statusText}`);
      }
      const payload = (await response.json()) as unknown;
      const models = normalizePricingMap(payload);
      this.cache = {
        lastSuccessAtMs: nowMs,
        models,
      };
      return {
        ok: true,
        cache: this.cache,
        stale: false,
      };
    } catch (error) {
      if (!this.cache) {
        return {
          ok: false,
          sourceLabel: null,
          updatedAt: null,
          reasonCode: "PRICING_FETCH_FAILED",
          reasonMessage: error instanceof Error ? error.message : "Pricing source is unavailable",
          stale: false,
        };
      }

      const cacheAgeMs = this.toCacheAgeMs(nowMs);
      if (cacheAgeMs > this.staleMaxAgeMs) {
        return {
          ok: false,
          sourceLabel: STALE_SOURCE_LABEL,
          updatedAt: this.toCacheUpdatedAtIso(),
          reasonCode: "PRICING_CACHE_TOO_OLD",
          reasonMessage: "Pricing cache is older than staleMaxAge and cannot be reused",
          stale: true,
        };
      }

      return {
        ok: true,
        cache: this.cache,
        stale: true,
      };
    }
  };

  async lookupModelPrice(input: {
    providerId: "codex" | "claude";
    modelId: string;
    now: Date;
  }): Promise<ModelPriceLookupResult> {
    const data = await this.loadPricingData(input.now.getTime());
    if (!data.ok) {
      return toFailure(data);
    }

    const availableModelIds = Object.keys(data.cache.models);
    const resolved = resolveModelId({
      providerId: input.providerId,
      modelId: input.modelId,
      availableModelIds,
    });

    const sourceLabel = data.stale ? STALE_SOURCE_LABEL : SOURCE_LABEL;
    const updatedAt = new Date(data.cache.lastSuccessAtMs).toISOString();
    const primaryModelId = resolved.resolvedModelId;
    const primaryRow = primaryModelId ? parsePriceRow(data.cache.models[primaryModelId]) : null;
    if (primaryModelId && resolved.strategy !== "none" && primaryRow?.hasPrice) {
      return {
        ok: true,
        quote: {
          modelId: input.modelId,
          resolvedModelId: primaryModelId,
          strategy: resolved.strategy,
          inputCostPerToken: primaryRow.inputCostPerToken,
          outputCostPerToken: primaryRow.outputCostPerToken,
          cacheReadInputCostPerToken: primaryRow.cacheReadInputCostPerToken,
          cacheCreationInputCostPerToken: primaryRow.cacheCreationInputCostPerToken,
          hasPrice: true,
          sourceLabel,
          updatedAt,
          stale: data.stale,
        },
      };
    }

    const fallbackTargetModelId = primaryModelId ?? input.modelId;
    const inferredFallbackModelId = inferClosestOlderModelWithPrice({
      providerId: input.providerId,
      modelId: fallbackTargetModelId,
      availableModelIds,
      pricingRows: data.cache.models,
    });

    if (inferredFallbackModelId) {
      const fallbackRow = parsePriceRow(data.cache.models[inferredFallbackModelId]);
      if (fallbackRow?.hasPrice) {
        return {
          ok: true,
          quote: {
            modelId: input.modelId,
            resolvedModelId: inferredFallbackModelId,
            strategy: "fallback",
            inputCostPerToken: fallbackRow.inputCostPerToken,
            outputCostPerToken: fallbackRow.outputCostPerToken,
            cacheReadInputCostPerToken: fallbackRow.cacheReadInputCostPerToken,
            cacheCreationInputCostPerToken: fallbackRow.cacheCreationInputCostPerToken,
            hasPrice: true,
            sourceLabel,
            updatedAt,
            stale: data.stale,
          },
        };
      }
    }

    if (!primaryModelId || resolved.strategy === "none") {
      return toFailure({
        sourceLabel,
        updatedAt,
        reasonCode: "MODEL_MAPPING_MISSING",
        reasonMessage: `Model mapping not found for ${input.modelId}`,
        stale: data.stale,
      });
    }
    if (!primaryRow) {
      return toFailure({
        sourceLabel,
        updatedAt,
        reasonCode: "MODEL_MAPPING_MISSING",
        reasonMessage: `Pricing row not found for ${primaryModelId}`,
        stale: data.stale,
      });
    }
    if (!primaryRow.hasPrice) {
      return toFailure({
        sourceLabel,
        updatedAt,
        reasonCode: "MODEL_PRICE_MISSING",
        reasonMessage: "Model price is unavailable in pricing source",
        stale: data.stale,
      });
    }

    return {
      ok: false,
      sourceLabel,
      updatedAt,
      reasonCode: "MODEL_MAPPING_MISSING",
      reasonMessage: `Model mapping not found for ${input.modelId}`,
      stale: data.stale,
    };
  }
}
