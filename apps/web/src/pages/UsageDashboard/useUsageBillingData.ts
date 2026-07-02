import type {
  UsageDashboardResponse,
  UsageIssue,
  UsageProviderSnapshot,
} from "@vde-monitor/shared";
import { type Dispatch, type SetStateAction, useCallback, useRef, useState } from "react";

import { API_ERROR_MESSAGES } from "@/lib/api-messages";
import { useVisibilityPolling } from "@/lib/use-visibility-polling";

const BILLING_POLL_INTERVAL_MS = 180_000;

export type BillingProviderId = "codex" | "claude";
export const FALLBACK_BILLING_PROVIDERS: BillingProviderId[] = ["codex", "claude"];

export const mergeIssues = (current: UsageIssue[], next: UsageIssue[]): UsageIssue[] => {
  if (next.length === 0) {
    return current;
  }
  const merged = [...current];
  for (const issue of next) {
    if (!merged.some((item) => item.code === issue.code && item.message === issue.message)) {
      merged.push(issue);
    }
  }
  return merged;
};

type SetDashboard = Dispatch<SetStateAction<UsageDashboardResponse | null>>;

type RequestUsageProviderBilling = (options: {
  provider: BillingProviderId;
  refresh?: boolean;
}) => Promise<UsageProviderSnapshot>;

type ResolveErrorMessage = (error: unknown, fallback: string) => string;

export const useUsageBillingData = ({
  canRequest,
  requestUsageProviderBilling,
  resolveErrorMessage,
  setDashboard,
}: {
  canRequest: boolean;
  requestUsageProviderBilling: RequestUsageProviderBilling;
  resolveErrorMessage: ResolveErrorMessage;
  setDashboard: SetDashboard;
}) => {
  const [billingLoadingByProvider, setBillingLoadingByProvider] = useState<
    Record<BillingProviderId, boolean>
  >({
    codex: false,
    claude: false,
  });
  const billingRequestIdRef = useRef<Record<BillingProviderId, number>>({
    codex: 0,
    claude: 0,
  });
  const billingInFlightRef = useRef<Record<BillingProviderId, boolean>>({
    codex: false,
    claude: false,
  });
  // Updated by loadAllProviderBilling when explicit providers are passed (from dashboard load).
  // Used by polling ticks that call loadAllProviderBilling with no args.
  const dashboardBillingProvidersRef = useRef<BillingProviderId[]>(FALLBACK_BILLING_PROVIDERS);

  const resetBillingState = useCallback(() => {
    setBillingLoadingByProvider({ codex: false, claude: false });
  }, []);

  const loadProviderBilling = useCallback(
    async ({
      provider,
      forceRefresh = false,
    }: {
      provider: BillingProviderId;
      forceRefresh?: boolean;
    }) => {
      if (billingInFlightRef.current[provider]) {
        return;
      }
      const requestId = ++billingRequestIdRef.current[provider];
      if (!canRequest) {
        return;
      }
      billingInFlightRef.current[provider] = true;
      setBillingLoadingByProvider((current) => ({ ...current, [provider]: true }));
      try {
        const billingSnapshot = await requestUsageProviderBilling({
          provider,
          refresh: forceRefresh,
        });
        if (requestId !== billingRequestIdRef.current[provider]) {
          return;
        }
        setDashboard((current) => {
          if (!current) {
            return current;
          }
          return {
            ...current,
            providers: current.providers.map((item) => {
              if (item.providerId !== provider) {
                return item;
              }
              return {
                ...item,
                billing: billingSnapshot.billing,
                capabilities: {
                  ...item.capabilities,
                  cost: billingSnapshot.capabilities.cost,
                },
                issues: mergeIssues(item.issues, billingSnapshot.issues),
              };
            }),
          };
        });
      } catch (error) {
        if (requestId !== billingRequestIdRef.current[provider]) {
          return;
        }
        const reasonMessage = resolveErrorMessage(error, API_ERROR_MESSAGES.usageProviderBilling);
        const issue: UsageIssue = {
          code: "COST_SOURCE_UNAVAILABLE",
          message: reasonMessage,
          severity: "warning",
        };
        setDashboard((current) => {
          if (!current) {
            return current;
          }
          return {
            ...current,
            providers: current.providers.map((item) => {
              if (item.providerId !== provider) {
                return item;
              }
              return {
                ...item,
                billing: {
                  ...item.billing,
                  meta: {
                    source: "unavailable",
                    sourceLabel: item.billing.meta.sourceLabel,
                    confidence: null,
                    updatedAt: new Date().toISOString(),
                    reasonCode: issue.code,
                    reasonMessage: issue.message,
                  },
                  modelBreakdown: [],
                  dailyBreakdown: [],
                },
                issues: mergeIssues(item.issues, [issue]),
              };
            }),
          };
        });
      } finally {
        if (requestId === billingRequestIdRef.current[provider]) {
          setBillingLoadingByProvider((current) => ({ ...current, [provider]: false }));
        }
        billingInFlightRef.current[provider] = false;
      }
    },
    [canRequest, requestUsageProviderBilling, resolveErrorMessage, setDashboard],
  );

  // When explicit providers are supplied (from a dashboard load result), update the stored
  // providers ref so that subsequent polling ticks fetch the correct set.
  const loadAllProviderBilling = useCallback(
    async ({
      providers,
      forceRefresh = false,
    }: {
      providers?: BillingProviderId[];
      forceRefresh?: boolean;
    } = {}) => {
      if (providers != null) {
        dashboardBillingProvidersRef.current = providers;
      }
      const targets = providers ?? dashboardBillingProvidersRef.current;
      if (targets.length === 0) {
        return;
      }
      await Promise.all(targets.map((provider) => loadProviderBilling({ provider, forceRefresh })));
    },
    [loadProviderBilling],
  );

  useVisibilityPolling({
    enabled: canRequest,
    intervalMs: BILLING_POLL_INTERVAL_MS,
    onTick: () => {
      void loadAllProviderBilling();
    },
    onResume: () => {
      void loadAllProviderBilling();
    },
  });

  return { billingLoadingByProvider, loadAllProviderBilling, resetBillingState };
};
