import type { SupportedUsageCostProviderId } from "./types";

const CLAUDE_ALIASES = {
  haiku: "claude-haiku-4-5-20251001",
} as const;

const CODEX_ALIASES = {
  "gpt-5-codex": "gpt-5",
} as const;

export const EXCLUDED_USAGE_MODELS = new Set<string>(["<synthetic>"]);

export const PROVIDER_PREFIX_CANDIDATES: Record<SupportedUsageCostProviderId, readonly string[]> = {
  claude: ["anthropic/", "claude-"],
  codex: ["openai/", "azure/", "openrouter/openai/", "github_copilot/"],
};

const PROVIDER_ALIAS_MAP: Record<SupportedUsageCostProviderId, Record<string, string>> = {
  claude: CLAUDE_ALIASES,
  codex: CODEX_ALIASES,
};

export const resolveProviderAlias = (
  providerId: SupportedUsageCostProviderId,
  modelId: string,
): string | null => {
  const mapped = PROVIDER_ALIAS_MAP[providerId][modelId];
  return mapped ?? null;
};
