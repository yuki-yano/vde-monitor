import type {
  UsageConfig,
  UsageDashboardResponse,
  UsageMetricWindow,
  UsageProviderId,
  UsageProviderSnapshot,
} from "@vde-monitor/shared";

import { fetchClaudeOauthUsageWithFallback } from "../claude-usage/claude-usage-service";
import { fetchCodexRateLimits } from "../codex-usage/codex-usage-service";
import type { UsageCostProvider } from "../usage-cost/types";
import { UsageProviderError } from "../usage-shared/usage-error";
import {
  collectCodexWindowCandidates,
  findByDuration,
  pickPrimaryWindowCandidate,
} from "./codex-window-selector";
import { createUsageMetricWindow } from "./pace-calculator";
import {
  SUPPORTED_PROVIDERS,
  type SupportedProviderId,
  type UsageSnapshotCore,
  baseCapabilities,
  createUsageSnapshotCache,
  emptyBilling,
} from "./usage-snapshot-cache";

const DEFAULT_CACHE_TTL_MS = 180_000;
const DEFAULT_BILLING_CACHE_TTL_MS = 180_000;
const CODEX_BILLING_CACHE_TTL_MS = 600_000;
const DEFAULT_BACKOFF_MS = 30_000;
const DEFAULT_PROVIDER_TIMEOUT_MS = 5_000;
const DEFAULT_PACE_BALANCED_THRESHOLD_PERCENT = 10;

type UsageDashboardServiceOptions = {
  cacheTtlMs?: number;
  billingCacheTtlMs?: number;
  backoffMs?: number;
  providerTimeoutMs?: number;
  paceBalancedThresholdPercent?: number;
  costProvider?: UsageCostProvider;
  usageConfig?: UsageConfig;
};

type ProviderSnapshotOptions = {
  forceRefresh?: boolean;
  includeWindows?: boolean;
};

type DashboardOptions = {
  provider?: UsageProviderId;
  forceRefresh?: boolean;
};

const isSupportedProvider = (value: UsageProviderId | undefined): value is SupportedProviderId =>
  value != null && (SUPPORTED_PROVIDERS as readonly UsageProviderId[]).includes(value);

const toIsoFromEpoch = (value: number | null): string | null => {
  if (value == null || !Number.isFinite(value)) {
    return null;
  }
  const epochMs = value > 1_000_000_000_000 ? value : value * 1000;
  return new Date(epochMs).toISOString();
};

const toSnapshotCore = (snapshot: UsageProviderSnapshot): UsageSnapshotCore => {
  const core = { ...snapshot } as Partial<UsageProviderSnapshot>;
  delete core.fetchedAt;
  delete core.staleAt;
  return core as UsageSnapshotCore;
};

const normalizeProviderId = (provider: UsageProviderId | undefined): SupportedProviderId[] => {
  if (provider == null) {
    return [...SUPPORTED_PROVIDERS];
  }
  if (isSupportedProvider(provider)) {
    return [provider];
  }
  return [];
};

const buildCodexSnapshot = async ({
  timeoutMs,
  nowMs,
  balancedThresholdPercent,
}: {
  timeoutMs: number;
  nowMs: number;
  balancedThresholdPercent: number;
}): Promise<UsageSnapshotCore> => {
  const response = await fetchCodexRateLimits({ timeoutMs });
  const candidates = collectCodexWindowCandidates(
    response.rateLimits,
    response.rateLimitsByLimitId,
  );
  const sessionCandidates = findByDuration(candidates, 300);
  const weeklyCandidates = findByDuration(candidates, 10_080);
  const sessionCandidate = pickPrimaryWindowCandidate(sessionCandidates);
  const weeklyCandidate = pickPrimaryWindowCandidate(weeklyCandidates);

  if (!weeklyCandidate) {
    throw new UsageProviderError(
      "UNSUPPORTED_RESPONSE",
      "Codex rate limits response did not include a weekly window",
    );
  }

  const billing = emptyBilling();
  const credits = response.rateLimits.credits;
  if (credits?.balance != null) {
    const parsedCredits = Number(credits.balance);
    if (Number.isFinite(parsedCredits)) {
      billing.creditsLeft = parsedCredits;
      billing.creditsUnit = "credits";
    }
  }

  const windows: UsageMetricWindow[] = [];
  if (sessionCandidate) {
    windows.push(
      createUsageMetricWindow({
        id: "session",
        title: "Session",
        utilizationPercent: sessionCandidate.window.usedPercent,
        windowDurationMs: (sessionCandidate.window.windowDurationMins ?? 300) * 60 * 1000,
        resetsAt: toIsoFromEpoch(sessionCandidate.window.resetsAt),
        nowMs,
        balancedThresholdPercent,
      }),
    );
  }
  windows.push(
    createUsageMetricWindow({
      id: "weekly",
      title: "Weekly",
      utilizationPercent: weeklyCandidate.window.usedPercent,
      windowDurationMs: (weeklyCandidate.window.windowDurationMins ?? 10_080) * 60 * 1000,
      resetsAt: toIsoFromEpoch(weeklyCandidate.window.resetsAt),
      nowMs,
      balancedThresholdPercent,
    }),
  );

  const capabilities = baseCapabilities("codex");
  capabilities.session = sessionCandidate != null;
  capabilities.credits = billing.creditsLeft != null;

  return {
    providerId: "codex",
    providerLabel: "Codex",
    accountLabel:
      weeklyCandidate.snapshot.limitName ?? sessionCandidate?.snapshot.limitName ?? null,
    planLabel: weeklyCandidate.snapshot.planType ?? sessionCandidate?.snapshot.planType ?? null,
    windows,
    billing,
    capabilities,
    status: "ok",
    issues: [],
  };
};

const buildClaudeSnapshot = async ({
  timeoutMs,
  nowMs,
  balancedThresholdPercent,
}: {
  timeoutMs: number;
  nowMs: number;
  balancedThresholdPercent: number;
}): Promise<UsageSnapshotCore> => {
  const response = await fetchClaudeOauthUsageWithFallback({ timeoutMs });

  const windows: UsageMetricWindow[] = [
    createUsageMetricWindow({
      id: "session",
      title: "Session",
      utilizationPercent: response.fiveHour.utilizationPercent,
      windowDurationMs: response.fiveHour.windowDurationMins * 60 * 1000,
      resetsAt: response.fiveHour.resetsAt,
      nowMs,
      balancedThresholdPercent,
    }),
    createUsageMetricWindow({
      id: "weekly",
      title: "Weekly",
      utilizationPercent: response.sevenDay.utilizationPercent,
      windowDurationMs: response.sevenDay.windowDurationMins * 60 * 1000,
      resetsAt: response.sevenDay.resetsAt,
      nowMs,
      balancedThresholdPercent,
    }),
  ];

  for (const modelWindow of response.modelWindows) {
    windows.push(
      createUsageMetricWindow({
        id: "model",
        title: `${modelWindow.modelLabel} Weekly`,
        utilizationPercent: modelWindow.utilizationPercent,
        windowDurationMs: modelWindow.windowDurationMins * 60 * 1000,
        resetsAt: modelWindow.resetsAt,
        nowMs,
        balancedThresholdPercent,
      }),
    );
  }

  const capabilities = baseCapabilities("claude");
  capabilities.modelWindows = response.modelWindows.length > 0;

  return {
    providerId: "claude",
    providerLabel: "Claude",
    accountLabel: null,
    planLabel: null,
    windows,
    billing: emptyBilling(),
    capabilities,
    status: "ok",
    issues: [],
  };
};

export type UsageDashboardService = {
  getDashboard: (options?: DashboardOptions) => Promise<UsageDashboardResponse>;
  getProviderSnapshot: (
    providerId: SupportedProviderId,
    options?: ProviderSnapshotOptions,
  ) => Promise<UsageProviderSnapshot>;
};

export const createUsageDashboardService = (
  options: UsageDashboardServiceOptions = {},
): UsageDashboardService => {
  const cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  const billingCacheTtlMs = options.billingCacheTtlMs;
  const backoffMs = options.backoffMs ?? DEFAULT_BACKOFF_MS;
  const providerTimeoutMs = options.providerTimeoutMs ?? DEFAULT_PROVIDER_TIMEOUT_MS;
  const balancedThresholdPercent =
    options.paceBalancedThresholdPercent ?? DEFAULT_PACE_BALANCED_THRESHOLD_PERCENT;
  const costProvider = options.costProvider;
  const usageConfig = options.usageConfig;

  const isSessionEnabled = (providerId: SupportedProviderId) =>
    usageConfig?.session.providers[providerId].enabled !== false;
  const isPricingEnabled = (providerId: SupportedProviderId) =>
    usageConfig?.pricing.providers[providerId].enabled !== false;
  const resolveBillingCacheTtlMs = (providerId: SupportedProviderId) =>
    billingCacheTtlMs ??
    (providerId === "codex" ? CODEX_BILLING_CACHE_TTL_MS : DEFAULT_BILLING_CACHE_TTL_MS);

  const fetchSnapshotCore = (
    providerId: SupportedProviderId,
    nowMs: number,
  ): Promise<UsageSnapshotCore> => {
    if (providerId === "codex") {
      return buildCodexSnapshot({ timeoutMs: providerTimeoutMs, nowMs, balancedThresholdPercent });
    }
    return buildClaudeSnapshot({ timeoutMs: providerTimeoutMs, nowMs, balancedThresholdPercent });
  };

  const cache = createUsageSnapshotCache({
    cacheTtlMs,
    backoffMs,
    costProvider,
    isPricingEnabled,
    resolveBillingCacheTtlMs,
    fetchSnapshotCore,
  });

  const applySessionVisibility = ({
    snapshot,
    providerId,
  }: {
    snapshot: UsageProviderSnapshot;
    providerId: SupportedProviderId;
  }): UsageProviderSnapshot => {
    if (isSessionEnabled(providerId)) {
      return snapshot;
    }
    return {
      ...snapshot,
      windows: snapshot.windows.filter((window) => window.id !== "session"),
      capabilities: {
        ...snapshot.capabilities,
        session: false,
      },
    };
  };

  const getProviderSnapshot: UsageDashboardService["getProviderSnapshot"] = async (
    providerId,
    providerOptions = {},
  ) => {
    const includeWindows = providerOptions.includeWindows !== false;
    const coreSnapshot = await cache.getProviderCoreSnapshot(providerId, {
      forceRefresh: providerOptions.forceRefresh,
    });

    const enriched = await cache.enrichSnapshotWithCost({
      snapshot: toSnapshotCore(coreSnapshot),
      providerId,
      now: new Date(),
      forceRefresh: providerOptions.forceRefresh,
    });
    const snapshot: UsageProviderSnapshot = {
      ...coreSnapshot,
      ...enriched,
      fetchedAt: coreSnapshot.fetchedAt,
      staleAt: coreSnapshot.staleAt,
    };
    const visibleSnapshot = applySessionVisibility({ snapshot, providerId });

    if (!includeWindows) {
      return {
        ...visibleSnapshot,
        windows: [],
      };
    }
    return visibleSnapshot;
  };

  const getDashboard: UsageDashboardService["getDashboard"] = async (dashboardOptions = {}) => {
    const providerIds = normalizeProviderId(dashboardOptions.provider);
    const providers = await Promise.all(
      providerIds.map((providerId) =>
        cache.getProviderCoreSnapshot(providerId, {
          forceRefresh: dashboardOptions.forceRefresh,
        }),
      ),
    );
    const visibleProviders = providers.map((provider) =>
      applySessionVisibility({
        snapshot: provider,
        providerId: provider.providerId as SupportedProviderId,
      }),
    );
    return {
      providers: visibleProviders,
      fetchedAt: new Date().toISOString(),
    };
  };

  return {
    getDashboard,
    getProviderSnapshot,
  };
};
