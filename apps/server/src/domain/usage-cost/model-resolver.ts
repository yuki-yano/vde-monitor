import {
  EXCLUDED_USAGE_MODELS,
  PROVIDER_PREFIX_CANDIDATES,
  resolveProviderAlias,
} from "./provider-alias";
import type { ResolveModelInput, ResolveModelResult } from "./types";

const findWithPrefix = (
  modelId: string,
  prefixes: readonly string[],
  available: ReadonlySet<string>,
): string | null => {
  for (const prefix of prefixes) {
    const candidate = `${prefix}${modelId}`;
    if (available.has(candidate)) {
      return candidate;
    }
  }
  return null;
};

export const resolveModelId = (input: ResolveModelInput): ResolveModelResult => {
  const modelId = input.modelId.trim();
  if (!modelId || EXCLUDED_USAGE_MODELS.has(modelId)) {
    return {
      resolvedModelId: null,
      strategy: "none",
    };
  }

  const available = new Set(input.availableModelIds);
  if (available.has(modelId)) {
    return {
      resolvedModelId: modelId,
      strategy: "exact",
    };
  }

  const prefixed = findWithPrefix(modelId, PROVIDER_PREFIX_CANDIDATES[input.providerId], available);
  if (prefixed) {
    return {
      resolvedModelId: prefixed,
      strategy: "prefix",
    };
  }

  const alias = resolveProviderAlias(input.providerId, modelId);
  if (alias) {
    if (available.has(alias)) {
      return {
        resolvedModelId: alias,
        strategy: "alias",
      };
    }
    const aliasPrefixed = findWithPrefix(
      alias,
      PROVIDER_PREFIX_CANDIDATES[input.providerId],
      available,
    );
    if (aliasPrefixed) {
      return {
        resolvedModelId: aliasPrefixed,
        strategy: "alias",
      };
    }
  }

  return {
    resolvedModelId: null,
    strategy: "none",
  };
};
