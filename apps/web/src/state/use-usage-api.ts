import type {
  ApiEnvelope,
  SessionStateTimelineRange,
  UsageDashboardResponse,
  UsageGlobalTimelineResponse,
  UsageProviderId,
} from "@vde-monitor/shared";
import {
  usageDashboardResponseSchema,
  usageGlobalTimelineResponseSchema,
} from "@vde-monitor/shared";
import { useCallback, useMemo } from "react";

import { API_ERROR_MESSAGES } from "@/lib/api-messages";
import {
  extractErrorMessage,
  requestJson,
  resolveUnknownErrorMessage,
  toErrorWithFallback,
} from "@/lib/api-utils";

type UseUsageApiParams = {
  token: string | null;
  apiBaseUrl?: string | null;
};

type RequestUsageDashboardOptions = {
  provider?: UsageProviderId;
  refresh?: boolean;
};

type RequestUsageGlobalTimelineOptions = {
  range?: SessionStateTimelineRange;
  limit?: number;
};

const DEFAULT_TIMELINE_RANGE: SessionStateTimelineRange = "1h";

const buildApiPath = (basePath: string, endpoint: string, query?: URLSearchParams) => {
  const normalizedBase = basePath.endsWith("/") ? basePath.slice(0, -1) : basePath;
  if (!query || Array.from(query.keys()).length === 0) {
    return `${normalizedBase}${endpoint}`;
  }
  return `${normalizedBase}${endpoint}?${query.toString()}`;
};

export const useUsageApi = ({ token, apiBaseUrl }: UseUsageApiParams) => {
  const apiBasePath = useMemo(() => {
    const normalized = apiBaseUrl?.trim();
    return normalized && normalized.length > 0 ? normalized : "/api";
  }, [apiBaseUrl]);

  const ensureToken = useCallback(() => {
    if (!token) {
      throw new Error(API_ERROR_MESSAGES.missingToken);
    }
  }, [token]);

  const requestUsageDashboard = useCallback(
    async (options: RequestUsageDashboardOptions = {}): Promise<UsageDashboardResponse> => {
      ensureToken();
      const query = new URLSearchParams();
      if (options.provider) {
        query.set("provider", options.provider);
      }
      if (options.refresh) {
        query.set("refresh", "1");
      }
      const request = fetch(buildApiPath(apiBasePath, "/usage/dashboard", query), {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      try {
        const { res, data } = await requestJson<UsageDashboardResponse | ApiEnvelope<unknown>>(
          request,
        );
        if (!res.ok) {
          throw new Error(
            extractErrorMessage(
              res,
              (data as ApiEnvelope<unknown> | null) ?? null,
              API_ERROR_MESSAGES.usageDashboard,
              {
                includeStatus: true,
              },
            ),
          );
        }
        const parsed = usageDashboardResponseSchema.safeParse(data);
        if (!parsed.success) {
          throw new Error(API_ERROR_MESSAGES.invalidResponse);
        }
        return parsed.data;
      } catch (error) {
        throw toErrorWithFallback(error, API_ERROR_MESSAGES.usageDashboard);
      }
    },
    [apiBasePath, ensureToken, token],
  );

  const requestUsageGlobalTimeline = useCallback(
    async (
      options: RequestUsageGlobalTimelineOptions = {},
    ): Promise<UsageGlobalTimelineResponse> => {
      ensureToken();
      const query = new URLSearchParams();
      query.set("range", options.range ?? DEFAULT_TIMELINE_RANGE);
      if (options.limit != null) {
        query.set("limit", String(Math.max(1, Math.floor(options.limit))));
      }
      const request = fetch(buildApiPath(apiBasePath, "/usage/state-timeline", query), {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      try {
        const { res, data } = await requestJson<UsageGlobalTimelineResponse | ApiEnvelope<unknown>>(
          request,
        );
        if (!res.ok) {
          throw new Error(
            extractErrorMessage(
              res,
              (data as ApiEnvelope<unknown> | null) ?? null,
              API_ERROR_MESSAGES.usageGlobalTimeline,
              {
                includeStatus: true,
              },
            ),
          );
        }
        const parsed = usageGlobalTimelineResponseSchema.safeParse(data);
        if (!parsed.success) {
          throw new Error(API_ERROR_MESSAGES.invalidResponse);
        }
        return parsed.data;
      } catch (error) {
        throw toErrorWithFallback(error, API_ERROR_MESSAGES.usageGlobalTimeline);
      }
    },
    [apiBasePath, ensureToken, token],
  );

  return useMemo(
    () => ({
      requestUsageDashboard,
      requestUsageGlobalTimeline,
      resolveErrorMessage: (error: unknown, fallback: string) =>
        resolveUnknownErrorMessage(error, fallback),
    }),
    [requestUsageDashboard, requestUsageGlobalTimeline],
  );
};
