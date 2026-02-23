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
  includeCost: z.enum(["0", "1"]).optional(),
});

const usageTimelineQuerySchema = z.object({
  range: sessionStateTimelineRangeSchema.optional(),
  limit: z.coerce.number().int().min(1).max(10_000).optional(),
});

const usageProviderQuerySchema = z.object({
  refresh: z.string().optional(),
  includeCost: z.enum(["0", "1"]).optional(),
});

const isRefreshRequested = (refresh: string | undefined) => refresh === "1";
const isCostIncluded = (includeCost: string | undefined) => includeCost !== "0";

const resolveGlobalTimelineRange = (
  range: z.infer<typeof sessionStateTimelineRangeSchema> | undefined,
) => range ?? "1h";

const applyRefreshRateLimit = ({
  c,
  forceRefresh,
  getLimiterKey,
  refreshLimiter,
}: {
  c: HeaderContext & { json: (body: unknown, status?: number) => Response };
  forceRefresh: boolean;
  getLimiterKey: GetLimiterKey;
  refreshLimiter: (key: string) => boolean;
}) => {
  if (!forceRefresh) {
    return null;
  }
  const limiterKey = `usage:${getLimiterKey(c)}`;
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
  const includeCost = isCostIncluded(c.req.valid("query").includeCost);
  const rateLimitResponse = applyRefreshRateLimit({
    c,
    forceRefresh,
    getLimiterKey,
    refreshLimiter,
  });
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  try {
    const provider = await usageDashboardService.getProviderSnapshot(providerId, {
      forceRefresh,
      includeCost,
    });
    return c.json({
      provider,
      fetchedAt: nowIso(),
    });
  } catch {
    return c.json({ error: buildError("INTERNAL", `failed to load ${providerId} usage`) }, 500);
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
      const includeCost = isCostIncluded(query.includeCost);
      const rateLimitResponse = applyRefreshRateLimit({
        c,
        forceRefresh,
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
          includeCost,
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
    .get("/usage/state-timeline", zValidator("query", usageTimelineQuerySchema), (c) => {
      const query = c.req.valid("query");
      const range = resolveGlobalTimelineRange(query.range);
      const timeline = monitor.getGlobalStateTimeline(range, query.limit);
      const sessions = monitor.registry.values();
      const activePaneCount = sessions.filter((session) => !session.paneDead).length;
      return c.json({
        timeline,
        paneCount: sessions.length,
        activePaneCount,
        fetchedAt: nowIso(),
      });
    });
};
