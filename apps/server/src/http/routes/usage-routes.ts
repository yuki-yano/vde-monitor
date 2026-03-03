import { zValidator } from "@hono/zod-validator";
import { sessionStateTimelineRangeSchema } from "@vde-monitor/shared";
import { Hono } from "hono";
import { z } from "zod";

import type { UsageDashboardService } from "../../domain/usage-dashboard/usage-dashboard-service";
import { buildError, nowIso } from "../helpers";
import type { GetLimiterKey, HeaderContext, Monitor } from "./types";

const usageDashboardQuerySchema = z.object({
  provider: z.enum(["codex", "claude"]).optional(),
  refresh: z.string().optional(),
});

const usageTimelineQuerySchema = z.object({
  range: sessionStateTimelineRangeSchema.optional(),
  limit: z.string().optional(),
});

const usageProviderQuerySchema = z.object({
  refresh: z.string().optional(),
  includeWindows: z.string().optional(),
});

const usageBillingQuerySchema = z.object({
  provider: z.enum(["codex", "claude"]),
  refresh: z.string().optional(),
});

const isRefreshRequested = (refresh: string | undefined) => refresh === "1";

const isFeatureEnabled = (value: string | undefined, defaultEnabled = true) => {
  if (value == null) {
    return defaultEnabled;
  }
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return defaultEnabled;
  }
  return !(
    normalized === "0" ||
    normalized === "false" ||
    normalized === "off" ||
    normalized === "no"
  );
};

const resolveGlobalTimelineRange = (
  range: z.infer<typeof sessionStateTimelineRangeSchema> | undefined,
) => range ?? "1h";

const applyRefreshRateLimit = ({
  c,
  forceRefresh,
  scope,
  getLimiterKey,
  refreshLimiter,
}: {
  c: HeaderContext & { json: (body: unknown, status?: number) => Response };
  forceRefresh: boolean;
  scope: string;
  getLimiterKey: GetLimiterKey;
  refreshLimiter: (key: string) => boolean;
}) => {
  if (!forceRefresh) {
    return null;
  }
  const limiterKey = `usage:${scope}:${getLimiterKey(c)}`;
  if (refreshLimiter(limiterKey)) {
    return null;
  }
  return c.json(
    { error: buildError("RATE_LIMIT", "usage refresh is temporarily rate limited") },
    429,
  );
};

type UsageProviderRouteContext = HeaderContext & {
  req: HeaderContext["req"] & {
    valid: (target: "query") => z.infer<typeof usageProviderQuerySchema>;
  };
  json: (body: unknown, status?: number) => Response;
};

type UsageBillingRouteContext = HeaderContext & {
  req: HeaderContext["req"] & {
    valid: (target: "query") => z.infer<typeof usageBillingQuerySchema>;
  };
  json: (body: unknown, status?: number) => Response;
};

const handleProviderUsage = async ({
  c,
  providerId,
  usageDashboardService,
  getLimiterKey,
  refreshLimiter,
}: {
  c: UsageProviderRouteContext;
  providerId: "codex" | "claude";
  usageDashboardService: UsageDashboardService;
  getLimiterKey: GetLimiterKey;
  refreshLimiter: (key: string) => boolean;
}) => {
  const forceRefresh = isRefreshRequested(c.req.valid("query").refresh);
  const rateLimitResponse = applyRefreshRateLimit({
    c,
    forceRefresh,
    scope: `provider:${providerId}`,
    getLimiterKey,
    refreshLimiter,
  });
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  try {
    const query = c.req.valid("query");
    const provider = await usageDashboardService.getProviderSnapshot(providerId, {
      forceRefresh,
      includeWindows: isFeatureEnabled(query.includeWindows, true),
    });
    return c.json({
      provider,
      fetchedAt: nowIso(),
    });
  } catch {
    return c.json({ error: buildError("INTERNAL", `failed to load ${providerId} usage`) }, 500);
  }
};

const handleProviderBilling = async ({
  c,
  usageDashboardService,
  getLimiterKey,
  refreshLimiter,
}: {
  c: UsageBillingRouteContext;
  usageDashboardService: UsageDashboardService;
  getLimiterKey: GetLimiterKey;
  refreshLimiter: (key: string) => boolean;
}) => {
  const query = c.req.valid("query");
  const forceRefresh = isRefreshRequested(query.refresh);
  const rateLimitResponse = applyRefreshRateLimit({
    c,
    forceRefresh,
    scope: `billing:${query.provider}`,
    getLimiterKey,
    refreshLimiter,
  });
  if (rateLimitResponse) {
    return rateLimitResponse;
  }
  try {
    const provider = await usageDashboardService.getProviderSnapshot(query.provider, {
      forceRefresh,
      includeWindows: false,
    });
    return c.json({
      provider,
      fetchedAt: nowIso(),
    });
  } catch {
    return c.json({ error: buildError("INTERNAL", "failed to load usage billing") }, 500);
  }
};

export const createUsageRoutes = ({
  monitor,
  usageDashboardService,
  getLimiterKey,
  refreshLimiter,
}: {
  monitor: Monitor;
  usageDashboardService: UsageDashboardService;
  getLimiterKey: GetLimiterKey;
  refreshLimiter: (key: string) => boolean;
}) => {
  return new Hono()
    .get("/usage/dashboard", zValidator("query", usageDashboardQuerySchema), async (c) => {
      const query = c.req.valid("query");
      const forceRefresh = isRefreshRequested(query.refresh);
      const rateLimitResponse = applyRefreshRateLimit({
        c,
        forceRefresh,
        scope: "dashboard",
        getLimiterKey,
        refreshLimiter,
      });
      if (rateLimitResponse) {
        return rateLimitResponse;
      }

      try {
        const dashboard = await usageDashboardService.getDashboard({
          provider: query.provider,
          forceRefresh,
        });
        return c.json(dashboard);
      } catch {
        return c.json({ error: buildError("INTERNAL", "failed to load usage dashboard") }, 500);
      }
    })
    .get("/codex/usage", zValidator("query", usageProviderQuerySchema), (c) =>
      handleProviderUsage({
        c,
        providerId: "codex",
        usageDashboardService,
        getLimiterKey,
        refreshLimiter,
      }),
    )
    .get("/claude/usage", zValidator("query", usageProviderQuerySchema), (c) =>
      handleProviderUsage({
        c,
        providerId: "claude",
        usageDashboardService,
        getLimiterKey,
        refreshLimiter,
      }),
    )
    .get("/usage/billing", zValidator("query", usageBillingQuerySchema), (c) =>
      handleProviderBilling({
        c,
        usageDashboardService,
        getLimiterKey,
        refreshLimiter,
      }),
    )
    .get("/usage/state-timeline", zValidator("query", usageTimelineQuerySchema), (c) => {
      const query = c.req.valid("query");
      const range = resolveGlobalTimelineRange(query.range);
      const timeline = monitor.getGlobalStateTimeline(range);
      const repoRanking = monitor.getGlobalRepoRanking(range);
      const sessions = monitor.registry.values();
      const activePaneCount = sessions.filter((session) => !session.paneDead).length;
      return c.json({
        timeline,
        paneCount: sessions.length,
        activePaneCount,
        repoRanking,
        fetchedAt: nowIso(),
      });
    });
};
