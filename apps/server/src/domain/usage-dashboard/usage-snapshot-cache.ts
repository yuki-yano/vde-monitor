import type {
  UsageBilling,
  UsageBillingMeta,
  UsageIssue,
  UsageProviderCapabilities,
  UsageProviderSnapshot,
} from "@vde-monitor/shared";

import type { ProviderCostResult, UsageCostProvider } from "../usage-cost/types";
import {
  USAGE_PROVIDER_ERROR_CODES,
  UsageProviderError,
  type UsageProviderErrorCode,
} from "../usage-shared/usage-error";

export const SUPPORTED_PROVIDERS = ["codex", "claude"] as const;
export type SupportedProviderId = (typeof SUPPORTED_PROVIDERS)[number];
export type UsageSnapshotCore = Omit<UsageProviderSnapshot, "fetchedAt" | "staleAt">;

type CoreCacheEntry = {
  snapshot: UsageProviderSnapshot;
  expiresAtMs: number;
  backoffUntilMs: number;
  failureCount: number;
};

type BillingCacheEntry = {
  result: ProviderCostResult;
  expiresAtMs: number;
};

// ---------------------------------------------------------------------------
// Shared snapshot helpers
// ---------------------------------------------------------------------------

const emptyBillingMeta = (): UsageBillingMeta => ({
  source: "unavailable",
  sourceLabel: null,
  confidence: null,
  updatedAt: null,
  reasonCode: null,
  reasonMessage: null,
});

export const emptyBilling = (): UsageBilling => ({
  creditsLeft: null,
  creditsUnit: null,
  extraUsageUsedUsd: null,
  extraUsageLimitUsd: null,
  costTodayUsd: null,
  costTodayTokens: null,
  costLast30DaysUsd: null,
  costLast30DaysTokens: null,
  meta: emptyBillingMeta(),
  modelBreakdown: [],
  dailyBreakdown: [],
});

export const baseCapabilities = (providerId: SupportedProviderId): UsageProviderCapabilities => {
  if (providerId === "codex") {
    return {
      session: true,
      weekly: true,
      pace: true,
      modelWindows: false,
      credits: true,
      extraUsage: false,
      cost: false,
    };
  }
  return {
    session: true,
    weekly: true,
    pace: true,
    modelWindows: false,
    credits: false,
    extraUsage: false,
    cost: false,
  };
};

// ---------------------------------------------------------------------------
// Internal cache helpers
// ---------------------------------------------------------------------------

const appendIssue = (issues: UsageIssue[], nextIssue: UsageIssue): UsageIssue[] => {
  if (
    issues.some((issue) => issue.code === nextIssue.code && issue.message === nextIssue.message)
  ) {
    return issues;
  }
  return [...issues, nextIssue];
};

const issueFromError = (error: unknown): UsageIssue => {
  if (error instanceof UsageProviderError) {
    return {
      code: error.code,
      message: error.message,
      severity: error.severity,
    };
  }
  return {
    code: "INTERNAL",
    message: "Usage provider request failed",
    severity: "error",
  };
};

const KNOWN_ERROR_CODES = new Set<string>(USAGE_PROVIDER_ERROR_CODES);

const normalizeErrorCode = (code: string): UsageProviderErrorCode =>
  KNOWN_ERROR_CODES.has(code) ? (code as UsageProviderErrorCode) : "INTERNAL";

const withTimestamps = (
  snapshot: UsageSnapshotCore,
  nowMs: number,
  ttlMs: number,
): UsageProviderSnapshot => ({
  ...snapshot,
  fetchedAt: new Date(nowMs).toISOString(),
  staleAt: new Date(nowMs + ttlMs).toISOString(),
});

const withStatusIssue = (
  snapshot: UsageProviderSnapshot,
  issue: UsageIssue,
  status: UsageProviderSnapshot["status"],
): UsageProviderSnapshot => ({
  ...snapshot,
  status,
  issues: appendIssue(snapshot.issues, issue),
});

const emptyErrorSnapshot = ({
  providerId,
  nowMs,
  issue,
}: {
  providerId: SupportedProviderId;
  nowMs: number;
  issue: UsageIssue;
}): UsageProviderSnapshot => ({
  providerId,
  providerLabel: providerId === "codex" ? "Codex" : "Claude",
  accountLabel: null,
  planLabel: null,
  windows: [],
  billing: emptyBilling(),
  capabilities: baseCapabilities(providerId),
  status: "error",
  issues: [issue],
  fetchedAt: new Date(nowMs).toISOString(),
  staleAt: new Date(nowMs).toISOString(),
});

const applyCostResultToSnapshot = ({
  snapshot,
  providerId,
  cost,
  isPricingEnabled,
}: {
  snapshot: UsageSnapshotCore;
  providerId: SupportedProviderId;
  cost: ProviderCostResult;
  isPricingEnabled: (providerId: SupportedProviderId) => boolean;
}): UsageSnapshotCore => {
  const providerPricingEnabled = isPricingEnabled(providerId);
  let issues = snapshot.issues;
  if (providerPricingEnabled && cost.source === "unavailable" && cost.reasonMessage) {
    issues = appendIssue(issues, {
      code: cost.reasonCode ?? "COST_SOURCE_UNAVAILABLE",
      message: cost.reasonMessage,
      severity: "warning",
    });
  }
  return {
    ...snapshot,
    billing: {
      ...snapshot.billing,
      costTodayUsd: cost.today.usd,
      costTodayTokens: cost.today.tokens,
      costLast30DaysUsd: cost.last30days.usd,
      costLast30DaysTokens: cost.last30days.tokens,
      meta: {
        source: cost.source,
        sourceLabel: cost.sourceLabel,
        confidence: cost.confidence,
        updatedAt: cost.updatedAt,
        reasonCode: cost.reasonCode,
        reasonMessage: cost.reasonMessage,
      },
      modelBreakdown: cost.modelBreakdown,
      dailyBreakdown: cost.dailyBreakdown,
    },
    capabilities: {
      ...snapshot.capabilities,
      cost: cost.source !== "unavailable" || providerPricingEnabled,
    },
    issues,
  };
};

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

export type UsageSnapshotCache = {
  getProviderCoreSnapshot: (
    providerId: SupportedProviderId,
    options?: { forceRefresh?: boolean },
  ) => Promise<UsageProviderSnapshot>;
  enrichSnapshotWithCost: (params: {
    snapshot: UsageSnapshotCore;
    providerId: SupportedProviderId;
    now: Date;
    forceRefresh?: boolean;
  }) => Promise<UsageSnapshotCore>;
};

export type UsageSnapshotCacheOptions = {
  cacheTtlMs: number;
  backoffMs: number;
  costProvider?: UsageCostProvider;
  isPricingEnabled: (providerId: SupportedProviderId) => boolean;
  resolveBillingCacheTtlMs: (providerId: SupportedProviderId) => number;
  fetchSnapshotCore: (providerId: SupportedProviderId, nowMs: number) => Promise<UsageSnapshotCore>;
};

export const createUsageSnapshotCache = (
  cacheOptions: UsageSnapshotCacheOptions,
): UsageSnapshotCache => {
  const {
    cacheTtlMs,
    backoffMs,
    costProvider,
    isPricingEnabled,
    resolveBillingCacheTtlMs,
    fetchSnapshotCore,
  } = cacheOptions;

  const coreCache = new Map<SupportedProviderId, CoreCacheEntry>();
  const billingCache = new Map<SupportedProviderId, BillingCacheEntry>();

  const getProviderCoreSnapshot = async (
    providerId: SupportedProviderId,
    providerOptions: { forceRefresh?: boolean } = {},
  ): Promise<UsageProviderSnapshot> => {
    const nowMs = Date.now();
    const forceRefresh = providerOptions.forceRefresh === true;
    const cached = coreCache.get(providerId);

    if (!forceRefresh && cached && nowMs < cached.expiresAtMs) {
      return cached.snapshot;
    }

    if (!forceRefresh && cached && nowMs < cached.backoffUntilMs) {
      return withStatusIssue(
        cached.snapshot,
        {
          code: "UPSTREAM_UNAVAILABLE",
          message: "Using cached usage data while provider is recovering.",
          severity: "warning",
        },
        "degraded",
      );
    }

    try {
      const freshCore = await fetchSnapshotCore(providerId, nowMs);
      const fresh = withTimestamps(freshCore, nowMs, cacheTtlMs);
      coreCache.set(providerId, {
        snapshot: fresh,
        expiresAtMs: nowMs + cacheTtlMs,
        backoffUntilMs: 0,
        failureCount: 0,
      });
      return fresh;
    } catch (error) {
      const issue = issueFromError(error);
      if (cached) {
        const degraded = withStatusIssue(cached.snapshot, issue, "degraded");
        coreCache.set(providerId, {
          snapshot: degraded,
          expiresAtMs: cached.expiresAtMs,
          backoffUntilMs: nowMs + backoffMs,
          failureCount: cached.failureCount + 1,
        });
        return degraded;
      }
      const normalizedIssue: UsageIssue = {
        code: normalizeErrorCode(issue.code),
        message: issue.message,
        severity: issue.severity,
      };
      const failedSnapshot = emptyErrorSnapshot({
        providerId,
        nowMs,
        issue: normalizedIssue,
      });
      coreCache.set(providerId, {
        snapshot: failedSnapshot,
        expiresAtMs: nowMs + Math.min(cacheTtlMs, 30_000),
        backoffUntilMs: nowMs + backoffMs,
        failureCount: 1,
      });
      return failedSnapshot;
    }
  };

  const enrichSnapshotWithCost = async ({
    snapshot,
    providerId,
    now,
    forceRefresh,
  }: {
    snapshot: UsageSnapshotCore;
    providerId: SupportedProviderId;
    now: Date;
    forceRefresh?: boolean;
  }): Promise<UsageSnapshotCore> => {
    const providerPricingEnabled = isPricingEnabled(providerId);
    const providerBillingCacheTtlMs = resolveBillingCacheTtlMs(providerId);
    if (!costProvider) {
      return {
        ...snapshot,
        capabilities: {
          ...snapshot.capabilities,
          cost: providerPricingEnabled,
        },
      };
    }

    const nowMs = now.getTime();
    const cachedBilling = billingCache.get(providerId);
    if (!forceRefresh && cachedBilling && nowMs < cachedBilling.expiresAtMs) {
      return applyCostResultToSnapshot({
        snapshot,
        providerId,
        cost: cachedBilling.result,
        isPricingEnabled,
      });
    }

    try {
      const cost = await costProvider.getProviderCost({
        providerId,
        now,
      });
      billingCache.set(providerId, {
        result: cost,
        expiresAtMs: nowMs + providerBillingCacheTtlMs,
      });
      return applyCostResultToSnapshot({
        snapshot,
        providerId,
        cost,
        isPricingEnabled,
      });
    } catch {
      const fallbackIssue: UsageIssue = {
        code: "COST_SOURCE_UNAVAILABLE",
        message: "Cost data source failed",
        severity: "warning",
      };
      const fallbackCost: ProviderCostResult = {
        today: {
          usd: null,
          tokens: null,
        },
        last30days: {
          usd: null,
          tokens: null,
        },
        source: "unavailable",
        sourceLabel: null,
        confidence: null,
        updatedAt: now.toISOString(),
        reasonCode: fallbackIssue.code,
        reasonMessage: fallbackIssue.message,
        modelBreakdown: [],
        dailyBreakdown: [],
      };
      billingCache.set(providerId, {
        result: fallbackCost,
        expiresAtMs: nowMs + providerBillingCacheTtlMs,
      });
      const costApplied = applyCostResultToSnapshot({
        snapshot,
        providerId,
        cost: fallbackCost,
        isPricingEnabled,
      });
      return {
        ...costApplied,
        issues: appendIssue(costApplied.issues, fallbackIssue),
      };
    }
  };

  return {
    getProviderCoreSnapshot,
    enrichSnapshotWithCost,
  };
};
