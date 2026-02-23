import type {
  UsageBilling,
  UsageBillingMeta,
  UsageDashboardResponse,
  UsageIssue,
  UsageMetricWindow,
  UsagePaceStatus,
  UsagePricingConfig,
  UsageProviderCapabilities,
  UsageProviderId,
  UsageProviderSnapshot,
} from "@vde-monitor/shared";

import {
  fetchClaudeOauthUsage,
  resolveClaudeOauthToken,
} from "../claude-usage/claude-usage-service";
import {
  type CodexRateLimitSnapshot,
  fetchCodexRateLimits,
} from "../codex-usage/codex-usage-service";
import type { ProviderCostResult, UsageCostProvider } from "../usage-cost/types";
import {
  USAGE_PROVIDER_ERROR_CODES,
  UsageProviderError,
  type UsageProviderErrorCode,
} from "./usage-error";

const SUPPORTED_PROVIDERS = ["codex", "claude"] as const;
type SupportedProviderId = (typeof SUPPORTED_PROVIDERS)[number];

const DEFAULT_CACHE_TTL_MS = 180_000;
const DEFAULT_BILLING_CACHE_TTL_MS = 180_000;
const DEFAULT_BACKOFF_MS = 30_000;
const DEFAULT_PROVIDER_TIMEOUT_MS = 5_000;
const DEFAULT_PACE_BALANCED_THRESHOLD_PERCENT = 10;

type UsageSnapshotCore = Omit<UsageProviderSnapshot, "fetchedAt" | "staleAt">;

type UsageDashboardServiceOptions = {
  cacheTtlMs?: number;
  billingCacheTtlMs?: number;
  backoffMs?: number;
  providerTimeoutMs?: number;
  paceBalancedThresholdPercent?: number;
  costProvider?: UsageCostProvider;
  pricingConfig?: UsagePricingConfig;
};

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

type ProviderSnapshotOptions = {
  forceRefresh?: boolean;
  includeWindows?: boolean;
};

type DashboardOptions = {
  provider?: UsageProviderId;
  forceRefresh?: boolean;
};

type CodexWindowCandidate = {
  snapshot: CodexRateLimitSnapshot;
  window: NonNullable<CodexRateLimitSnapshot["primary"]>;
  slot: "primary" | "secondary";
};

const isSupportedProvider = (value: UsageProviderId | undefined): value is SupportedProviderId =>
  value === "codex" || value === "claude";

const KNOWN_ERROR_CODES = new Set<string>(USAGE_PROVIDER_ERROR_CODES);

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const roundOne = (value: number) => Math.round(value * 10) / 10;

const emptyBillingMeta = (): UsageBillingMeta => ({
  source: "unavailable",
  sourceLabel: null,
  confidence: null,
  updatedAt: null,
  reasonCode: null,
  reasonMessage: null,
});

const emptyBilling = (): UsageBilling => ({
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

const baseCapabilities = (providerId: SupportedProviderId): UsageProviderCapabilities => {
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

const derivePace = ({
  utilizationPercent,
  windowDurationMs,
  resetsAt,
  nowMs,
  balancedThresholdPercent,
}: {
  utilizationPercent: number | null;
  windowDurationMs: number | null;
  resetsAt: string | null;
  nowMs: number;
  balancedThresholdPercent: number;
}): UsageMetricWindow["pace"] => {
  if (
    utilizationPercent == null ||
    windowDurationMs == null ||
    windowDurationMs <= 0 ||
    !resetsAt
  ) {
    return {
      elapsedPercent: null,
      projectedEndUtilizationPercent: null,
      paceMarginPercent: null,
      status: "unknown",
    };
  }
  const resetsAtMs = Date.parse(resetsAt);
  if (Number.isNaN(resetsAtMs)) {
    return {
      elapsedPercent: null,
      projectedEndUtilizationPercent: null,
      paceMarginPercent: null,
      status: "unknown",
    };
  }
  const remainingMs = Math.max(0, resetsAtMs - nowMs);
  const elapsedMs = clamp(windowDurationMs - remainingMs, 0, windowDurationMs);
  const elapsedPercent = (elapsedMs / windowDurationMs) * 100;
  if (elapsedPercent <= 0) {
    return {
      elapsedPercent: roundOne(elapsedPercent),
      projectedEndUtilizationPercent: null,
      paceMarginPercent: null,
      status: "unknown",
    };
  }
  const projectedEndUtilizationPercent = (utilizationPercent / elapsedPercent) * 100;
  const paceMarginPercent = 100 - projectedEndUtilizationPercent;
  let status: UsagePaceStatus = "balanced";
  if (paceMarginPercent >= balancedThresholdPercent) {
    status = "margin";
  } else if (paceMarginPercent <= -balancedThresholdPercent) {
    status = "over";
  }
  return {
    elapsedPercent: roundOne(elapsedPercent),
    projectedEndUtilizationPercent: roundOne(projectedEndUtilizationPercent),
    paceMarginPercent: roundOne(paceMarginPercent),
    status,
  };
};

const createUsageMetricWindow = ({
  id,
  title,
  utilizationPercent,
  windowDurationMs,
  resetsAt,
  nowMs,
  balancedThresholdPercent,
}: {
  id: UsageMetricWindow["id"];
  title: string;
  utilizationPercent: number | null;
  windowDurationMs: number | null;
  resetsAt: string | null;
  nowMs: number;
  balancedThresholdPercent: number;
}): UsageMetricWindow => ({
  id,
  title,
  utilizationPercent,
  windowDurationMs,
  resetsAt,
  pace: derivePace({
    utilizationPercent,
    windowDurationMs,
    resetsAt,
    nowMs,
    balancedThresholdPercent,
  }),
});

const toIsoFromEpoch = (value: number | null): string | null => {
  if (value == null || !Number.isFinite(value)) {
    return null;
  }
  const epochMs = value > 1_000_000_000_000 ? value : value * 1000;
  return new Date(epochMs).toISOString();
};

const collectCodexWindowCandidates = (
  baseSnapshot: CodexRateLimitSnapshot,
  byLimitId: Record<string, CodexRateLimitSnapshot> | null,
): CodexWindowCandidate[] => {
  const snapshots = [baseSnapshot, ...Object.values(byLimitId ?? {})];
  const candidates = snapshots.flatMap((snapshot) => {
    const rows: CodexWindowCandidate[] = [];
    if (snapshot.primary) {
      rows.push({
        snapshot,
        window: snapshot.primary,
        slot: "primary",
      });
    }
    if (snapshot.secondary) {
      rows.push({
        snapshot,
        window: snapshot.secondary,
        slot: "secondary",
      });
    }
    return rows;
  });

  const dedup = new Map<string, CodexWindowCandidate>();
  candidates.forEach((candidate) => {
    const key = [
      candidate.snapshot.limitId ?? "none",
      candidate.slot,
      candidate.window.windowDurationMins ?? "none",
      candidate.window.resetsAt ?? "none",
      candidate.window.usedPercent,
    ].join(":");
    dedup.set(key, candidate);
  });
  return Array.from(dedup.values());
};

const findByDuration = (candidates: CodexWindowCandidate[], durationMins: number) =>
  candidates.filter((candidate) => candidate.window.windowDurationMins === durationMins);

const resolveWindowResetAtMs = (candidate: CodexWindowCandidate): number => {
  const rawResetAt = candidate.window.resetsAt;
  if (rawResetAt == null || !Number.isFinite(rawResetAt)) {
    return Number.POSITIVE_INFINITY;
  }
  return rawResetAt > 1_000_000_000_000 ? rawResetAt : rawResetAt * 1000;
};

const pickPrimaryWindowCandidate = (
  candidates: CodexWindowCandidate[],
): CodexWindowCandidate | null => {
  if (candidates.length === 0) {
    return null;
  }
  return (
    [...candidates].sort((left, right) => {
      const leftResetAt = resolveWindowResetAtMs(left);
      const rightResetAt = resolveWindowResetAtMs(right);
      if (leftResetAt !== rightResetAt) {
        return leftResetAt - rightResetAt;
      }
      return right.window.usedPercent - left.window.usedPercent;
    })[0] ?? null
  );
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

  if (!sessionCandidate || !weeklyCandidate) {
    throw new UsageProviderError(
      "UNSUPPORTED_RESPONSE",
      "Codex rate limits response did not include session/weekly windows",
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

  const windows: UsageMetricWindow[] = [
    createUsageMetricWindow({
      id: "session",
      title: "Session",
      utilizationPercent: sessionCandidate.window.usedPercent,
      windowDurationMs: (sessionCandidate.window.windowDurationMins ?? 300) * 60 * 1000,
      resetsAt: toIsoFromEpoch(sessionCandidate.window.resetsAt),
      nowMs,
      balancedThresholdPercent,
    }),
    createUsageMetricWindow({
      id: "weekly",
      title: "Weekly",
      utilizationPercent: weeklyCandidate.window.usedPercent,
      windowDurationMs: (weeklyCandidate.window.windowDurationMins ?? 10_080) * 60 * 1000,
      resetsAt: toIsoFromEpoch(weeklyCandidate.window.resetsAt),
      nowMs,
      balancedThresholdPercent,
    }),
  ];

  const capabilities = baseCapabilities("codex");
  capabilities.credits = billing.creditsLeft != null;

  return {
    providerId: "codex",
    providerLabel: "Codex",
    accountLabel: weeklyCandidate.snapshot.limitName ?? sessionCandidate.snapshot.limitName,
    planLabel: weeklyCandidate.snapshot.planType ?? sessionCandidate.snapshot.planType,
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
  const token = await resolveClaudeOauthToken();
  const response = await fetchClaudeOauthUsage({ token, timeoutMs });

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

  if (response.sevenDaySonnet) {
    windows.push(
      createUsageMetricWindow({
        id: "model",
        title: "Sonnet Weekly",
        utilizationPercent: response.sevenDaySonnet.utilizationPercent,
        windowDurationMs: response.sevenDaySonnet.windowDurationMins * 60 * 1000,
        resetsAt: response.sevenDaySonnet.resetsAt,
        nowMs,
        balancedThresholdPercent,
      }),
    );
  }

  const capabilities = baseCapabilities("claude");
  capabilities.modelWindows = response.sevenDaySonnet != null;

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

const normalizeErrorCode = (code: string): UsageProviderErrorCode =>
  KNOWN_ERROR_CODES.has(code) ? (code as UsageProviderErrorCode) : "INTERNAL";

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
  const billingCacheTtlMs = options.billingCacheTtlMs ?? DEFAULT_BILLING_CACHE_TTL_MS;
  const backoffMs = options.backoffMs ?? DEFAULT_BACKOFF_MS;
  const providerTimeoutMs = options.providerTimeoutMs ?? DEFAULT_PROVIDER_TIMEOUT_MS;
  const balancedThresholdPercent =
    options.paceBalancedThresholdPercent ?? DEFAULT_PACE_BALANCED_THRESHOLD_PERCENT;
  const costProvider = options.costProvider;
  const pricingConfig = options.pricingConfig;
  const coreCache = new Map<SupportedProviderId, CoreCacheEntry>();
  const billingCache = new Map<SupportedProviderId, BillingCacheEntry>();

  const applyCostResultToSnapshot = ({
    snapshot,
    providerId,
    cost,
  }: {
    snapshot: UsageSnapshotCore;
    providerId: SupportedProviderId;
    cost: ProviderCostResult;
  }): UsageSnapshotCore => {
    const providerPricingEnabled = pricingConfig?.providers[providerId].enabled === true;
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
    const providerPricingEnabled = pricingConfig?.providers[providerId].enabled === true;
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
      });
    }

    try {
      const cost = await costProvider.getProviderCost({
        providerId,
        now,
      });
      billingCache.set(providerId, {
        result: cost,
        expiresAtMs: nowMs + billingCacheTtlMs,
      });
      return applyCostResultToSnapshot({
        snapshot,
        providerId,
        cost,
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
        expiresAtMs: nowMs + billingCacheTtlMs,
      });
      const costApplied = applyCostResultToSnapshot({
        snapshot,
        providerId,
        cost: fallbackCost,
      });
      return {
        ...costApplied,
        issues: appendIssue(costApplied.issues, fallbackIssue),
      };
    }
  };

  const fetchSnapshotCore = async (
    providerId: SupportedProviderId,
    nowMs: number,
  ): Promise<UsageSnapshotCore> => {
    if (providerId === "codex") {
      return buildCodexSnapshot({
        timeoutMs: providerTimeoutMs,
        nowMs,
        balancedThresholdPercent,
      });
    }
    return buildClaudeSnapshot({
      timeoutMs: providerTimeoutMs,
      nowMs,
      balancedThresholdPercent,
    });
  };

  const getProviderCoreSnapshot = async (
    providerId: SupportedProviderId,
    providerOptions: Pick<ProviderSnapshotOptions, "forceRefresh"> = {},
  ) => {
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

  const getProviderSnapshot: UsageDashboardService["getProviderSnapshot"] = async (
    providerId,
    providerOptions = {},
  ) => {
    const includeWindows = providerOptions.includeWindows !== false;
    const coreSnapshot = await getProviderCoreSnapshot(providerId, {
      forceRefresh: providerOptions.forceRefresh,
    });

    const enriched = await enrichSnapshotWithCost({
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

    if (!includeWindows) {
      return {
        ...snapshot,
        windows: [],
      };
    }
    return snapshot;
  };

  const getDashboard: UsageDashboardService["getDashboard"] = async (dashboardOptions = {}) => {
    const providerIds = normalizeProviderId(dashboardOptions.provider);
    const providers = await Promise.all(
      providerIds.map((providerId) =>
        getProviderCoreSnapshot(providerId, {
          forceRefresh: dashboardOptions.forceRefresh,
        }),
      ),
    );
    return {
      providers,
      fetchedAt: new Date().toISOString(),
    };
  };

  return {
    getDashboard,
    getProviderSnapshot,
  };
};
