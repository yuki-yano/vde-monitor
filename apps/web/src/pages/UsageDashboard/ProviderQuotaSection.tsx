import type { UsageMetricWindow, UsageProviderSnapshot } from "@vde-monitor/shared";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";

import { Callout, GlowCard, TagPill } from "@/components/ui";
import { cn } from "@/lib/cn";

import {
  type BillingBreakdownGranularity,
  aggregateBillingBreakdownRows,
  clampPercent,
  formatBufferLabel,
  formatDateTime,
  formatPaceLabel,
  formatPercent,
  formatResetIn,
  formatTokenCount,
  formatTokens,
  formatUsd,
  formatUsedElapsedLabel,
  resolveBufferTone,
  resolveCostSourceLabel,
  resolveCostSourceTone,
  resolveModelStrategyLabel,
  resolvePaceTone,
  resolveRemainingBufferPercent,
  resolveUsageColor,
} from "./usage-format";

const UsageMetricRow = ({ metric, nowMs }: { metric: UsageMetricWindow; nowMs: number }) => {
  const utilization = metric.utilizationPercent;
  const widthPercent = `${clampPercent(utilization ?? 0)}%`;
  const elapsedPercent = metric.pace.elapsedPercent;
  const elapsedMarkerLeft = elapsedPercent == null ? null : `${clampPercent(elapsedPercent)}%`;
  const bufferPercent = resolveRemainingBufferPercent(metric);
  return (
    <div className="border-latte-surface2/70 bg-latte-crust/55 space-y-1.5 rounded-2xl border px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-display text-latte-text text-base font-semibold">{metric.title}</p>
      </div>
      <div className="flex items-center gap-2">
        <div className="border-latte-surface2 bg-latte-base/70 relative h-2 flex-1 overflow-hidden rounded-full border">
          <div
            className={cn("h-full transition-[width]", resolveUsageColor(bufferPercent))}
            style={{ width: widthPercent }}
          />
          {elapsedMarkerLeft ? (
            <div
              className="bg-latte-text/70 pointer-events-none absolute bottom-[-2px] top-[-2px] z-10 w-px"
              style={{ left: `calc(${elapsedMarkerLeft} - 0.5px)` }}
              title={`Elapsed ${formatPercent(elapsedPercent)}`}
              aria-hidden="true"
            />
          ) : null}
        </div>
        <span
          className="text-latte-subtext0 shrink-0 text-[11px] tabular-nums"
          title="Used / Elapsed"
        >
          {formatUsedElapsedLabel(metric)}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
        <span className="border-latte-surface2 bg-latte-base/65 text-latte-subtext0 inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium">
          {formatResetIn(metric.resetsAt, nowMs)}
        </span>
        <span
          className={cn(
            "inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold",
            resolveBufferTone(bufferPercent),
          )}
        >
          {formatBufferLabel(bufferPercent)}
        </span>
        <span
          className={cn(
            "inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold",
            resolvePaceTone(metric.pace.status, metric.pace.paceMarginPercent),
          )}
        >
          {formatPaceLabel(metric)}
        </span>
      </div>
    </div>
  );
};

const BillingDailyBreakdown = ({ provider }: { provider: UsageProviderSnapshot }) => {
  const [open, setOpen] = useState(false);
  const [granularity, setGranularity] = useState<BillingBreakdownGranularity>("daily");
  const sourceRows = provider.billing.dailyBreakdown;
  const rows = aggregateBillingBreakdownRows(sourceRows, granularity);
  if (sourceRows.length === 0) {
    return null;
  }

  const total = rows.reduce(
    (acc, row) => {
      acc.inputTokens += row.inputTokens;
      acc.outputTokens += row.outputTokens;
      acc.cacheCreationInputTokens += row.cacheCreationInputTokens;
      acc.cacheReadInputTokens += row.cacheReadInputTokens;
      acc.totalTokens += row.totalTokens;
      if (row.usd != null) {
        acc.usd += row.usd;
        acc.hasUsd = true;
      }
      return acc;
    },
    {
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 0,
      totalTokens: 0,
      usd: 0,
      hasUsd: false,
    },
  );

  return (
    <div className="border-latte-surface2/70 bg-latte-base/40 rounded-xl border">
      <button
        type="button"
        className="hover:bg-latte-base/65 flex w-full items-center justify-between gap-2 rounded-xl px-2.5 py-2 text-left transition-colors"
        onClick={() => {
          setOpen((current) => !current);
        }}
        aria-expanded={open}
      >
        <span className="text-latte-text text-xs font-semibold">
          Usage breakdown (last 30 days)
        </span>
        {open ? (
          <ChevronUp className="text-latte-subtext0 h-3.5 w-3.5 shrink-0" />
        ) : (
          <ChevronDown className="text-latte-subtext0 h-3.5 w-3.5 shrink-0" />
        )}
      </button>
      {open ? (
        <div className="border-latte-surface2/70 border-t">
          <div className="border-latte-surface2/70 bg-latte-base/50 flex flex-wrap items-center gap-1.5 border-b px-2.5 py-1.5">
            {(["daily", "weekly", "monthly"] as const).map((option) => {
              const active = granularity === option;
              return (
                <button
                  key={option}
                  type="button"
                  className={cn(
                    "rounded-md border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide transition-colors",
                    active
                      ? "border-latte-lavender/65 bg-latte-lavender/18 text-latte-lavender"
                      : "border-latte-surface2/70 bg-latte-base/70 text-latte-subtext0 hover:border-latte-overlay1 hover:text-latte-text",
                  )}
                  onClick={() => {
                    setGranularity(option);
                  }}
                  aria-pressed={active}
                >
                  {option}
                </button>
              );
            })}
          </div>
          <div className="max-w-full overflow-x-auto">
            <table className="w-full min-w-[820px] text-[11px]">
              <thead>
                <tr className="border-latte-surface2/70 bg-latte-base/55 border-b text-left">
                  <th scope="col" className="text-latte-subtext1 px-2.5 py-1.5 font-medium">
                    {granularity === "daily" ? "Date" : "Period"}
                  </th>
                  <th scope="col" className="text-latte-subtext1 px-2.5 py-1.5 font-medium">
                    Models
                  </th>
                  <th
                    scope="col"
                    className="text-latte-subtext1 px-2.5 py-1.5 text-right font-medium"
                  >
                    Cost (USD)
                  </th>
                  <th
                    scope="col"
                    className="text-latte-subtext1 px-2.5 py-1.5 text-right font-medium"
                  >
                    Input
                  </th>
                  <th
                    scope="col"
                    className="text-latte-subtext1 px-2.5 py-1.5 text-right font-medium"
                  >
                    Output
                  </th>
                  <th
                    scope="col"
                    className="text-latte-subtext1 px-2.5 py-1.5 text-right font-medium"
                  >
                    Cache Create
                  </th>
                  <th
                    scope="col"
                    className="text-latte-subtext1 px-2.5 py-1.5 text-right font-medium"
                  >
                    Cache Read
                  </th>
                  <th
                    scope="col"
                    className="text-latte-subtext1 px-2.5 py-1.5 text-right font-medium"
                  >
                    Total Tokens
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.date} className="border-latte-surface2/40 border-b align-top">
                    <td className="text-latte-text px-2.5 py-1.5 tabular-nums">{row.date}</td>
                    <td className="px-2.5 py-1.5">
                      {row.modelIds.length > 0 ? (
                        <div className="flex flex-col gap-0.5">
                          {row.modelIds.map((modelId) => (
                            <span key={`${row.date}:${modelId}`} className="text-latte-subtext0">
                              - {modelId}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-latte-subtext0">-</span>
                      )}
                    </td>
                    <td className="text-latte-text px-2.5 py-1.5 text-right tabular-nums">
                      {formatUsd(row.usd)}
                    </td>
                    <td className="text-latte-text px-2.5 py-1.5 text-right tabular-nums">
                      {formatTokenCount(row.inputTokens)}
                    </td>
                    <td className="text-latte-text px-2.5 py-1.5 text-right tabular-nums">
                      {formatTokenCount(row.outputTokens)}
                    </td>
                    <td className="text-latte-text px-2.5 py-1.5 text-right tabular-nums">
                      {formatTokenCount(row.cacheCreationInputTokens)}
                    </td>
                    <td className="text-latte-text px-2.5 py-1.5 text-right tabular-nums">
                      {formatTokenCount(row.cacheReadInputTokens)}
                    </td>
                    <td className="text-latte-text px-2.5 py-1.5 text-right tabular-nums">
                      {formatTokenCount(row.totalTokens)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-latte-base/55">
                  <th scope="row" className="text-latte-text px-2.5 py-1.5 text-left font-semibold">
                    Total
                  </th>
                  <td className="text-latte-subtext0 px-2.5 py-1.5">-</td>
                  <td className="text-latte-text px-2.5 py-1.5 text-right font-semibold tabular-nums">
                    {total.hasUsd ? formatUsd(total.usd) : "Not available"}
                  </td>
                  <td className="text-latte-text px-2.5 py-1.5 text-right font-semibold tabular-nums">
                    {formatTokenCount(total.inputTokens)}
                  </td>
                  <td className="text-latte-text px-2.5 py-1.5 text-right font-semibold tabular-nums">
                    {formatTokenCount(total.outputTokens)}
                  </td>
                  <td className="text-latte-text px-2.5 py-1.5 text-right font-semibold tabular-nums">
                    {formatTokenCount(total.cacheCreationInputTokens)}
                  </td>
                  <td className="text-latte-text px-2.5 py-1.5 text-right font-semibold tabular-nums">
                    {formatTokenCount(total.cacheReadInputTokens)}
                  </td>
                  <td className="text-latte-text px-2.5 py-1.5 text-right font-semibold tabular-nums">
                    {formatTokenCount(total.totalTokens)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
};

const BillingModelMapping = ({ provider }: { provider: UsageProviderSnapshot }) => {
  const rows = provider.billing.modelBreakdown;
  if (rows.length === 0) {
    return null;
  }

  return (
    <div className="border-latte-surface2/70 bg-latte-base/40 space-y-1.5 rounded-xl border px-2.5 py-2">
      <p className="text-latte-subtext1 text-[11px] font-semibold">Model pricing mapping</p>
      <div className="space-y-1.5">
        {rows.map((row) => {
          const mappedLabel =
            row.modelId === row.resolvedModelId
              ? row.modelId
              : `${row.modelId} -> ${row.resolvedModelId}`;
          return (
            <div
              key={`${row.modelId}:${row.resolvedModelId}:${row.resolveStrategy}`}
              className="border-latte-surface2/60 bg-latte-base/55 flex flex-wrap items-center justify-between gap-1.5 rounded-lg border px-2 py-1.5"
            >
              <div className="min-w-0">
                <p className="text-latte-text truncate text-[11px]">{mappedLabel}</p>
                <p className="text-latte-subtext0 text-[10px]">
                  {formatTokenCount(row.tokens ?? 0)} tokens / {formatUsd(row.usd)}
                </p>
              </div>
              {row.resolveStrategy !== "exact" ? (
                <TagPill tone="meta">{resolveModelStrategyLabel(row.resolveStrategy)}</TagPill>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export const ProviderQuotaSection = ({
  title,
  provider,
  nowMs,
  providerLoading,
  billingLoading,
}: {
  title: string;
  provider: UsageProviderSnapshot | null;
  nowMs: number;
  providerLoading: boolean;
  billingLoading: boolean;
}) => {
  const visibleWindows =
    provider?.capabilities.session === false
      ? provider.windows.filter((metric) => metric.id !== "session")
      : (provider?.windows ?? []);
  const providerKey = provider?.providerId ?? title.toLowerCase();

  return (
    <GlowCard contentClassName="gap-3">
      <section>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-latte-text text-xl font-semibold">{title}</h2>
          {provider?.status === "degraded" ? (
            <TagPill tone="meta">Degraded</TagPill>
          ) : provider?.status === "error" ? (
            <TagPill tone="danger">Error</TagPill>
          ) : null}
        </div>
        <div className="mt-3 space-y-2.5">
          {visibleWindows.map((metric) => (
            <UsageMetricRow
              key={`${providerKey}-${metric.id}-${metric.title}`}
              metric={metric}
              nowMs={nowMs}
            />
          ))}
          {provider ? (
            <div className="border-latte-surface2/70 bg-latte-crust/55 space-y-2 rounded-2xl border px-3 py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-display text-latte-text text-base font-semibold">Billing</p>
                {billingLoading ? (
                  <TagPill tone="meta">
                    <span className="bg-latte-subtext0 mr-1.5 inline-block h-1.5 w-1.5 animate-pulse rounded-full" />
                    Loading
                  </TagPill>
                ) : (
                  <TagPill tone={resolveCostSourceTone(provider.billing.meta.source)}>
                    {resolveCostSourceLabel(provider.billing.meta.source)}
                  </TagPill>
                )}
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div className="border-latte-surface2/70 bg-latte-base/55 rounded-xl border px-2.5 py-2">
                  <p className="text-latte-subtext0 text-[11px]">Today</p>
                  {billingLoading ? (
                    <div className="space-y-1.5 pt-0.5">
                      <div className="bg-latte-surface2/80 h-3.5 w-20 animate-pulse rounded-sm" />
                      <div className="bg-latte-surface1/80 h-2.5 w-16 animate-pulse rounded-sm" />
                    </div>
                  ) : (
                    <>
                      <p className="text-latte-text text-sm font-semibold">
                        {formatUsd(provider.billing.costTodayUsd)}
                      </p>
                      <p className="text-latte-subtext0 text-xs">
                        {formatTokens(provider.billing.costTodayTokens)}
                      </p>
                    </>
                  )}
                </div>
                <div className="border-latte-surface2/70 bg-latte-base/55 rounded-xl border px-2.5 py-2">
                  <p className="text-latte-subtext0 text-[11px]">Last 30 days</p>
                  {billingLoading ? (
                    <div className="space-y-1.5 pt-0.5">
                      <div className="bg-latte-surface2/80 h-3.5 w-24 animate-pulse rounded-sm" />
                      <div className="bg-latte-surface1/80 h-2.5 w-20 animate-pulse rounded-sm" />
                    </div>
                  ) : (
                    <>
                      <p className="text-latte-text text-sm font-semibold">
                        {formatUsd(provider.billing.costLast30DaysUsd)}
                      </p>
                      <p className="text-latte-subtext0 text-xs">
                        {formatTokens(provider.billing.costLast30DaysTokens)}
                      </p>
                    </>
                  )}
                </div>
              </div>
              {!billingLoading ? <BillingModelMapping provider={provider} /> : null}
              {!billingLoading ? <BillingDailyBreakdown provider={provider} /> : null}
              {!billingLoading && provider.billing.meta.sourceLabel ? (
                <p className="text-latte-subtext0 text-xs">
                  Source: {provider.billing.meta.sourceLabel}
                </p>
              ) : null}
              {!billingLoading && provider.billing.meta.updatedAt ? (
                <p className="text-latte-subtext0 text-xs">
                  Updated: {formatDateTime(provider.billing.meta.updatedAt)}
                </p>
              ) : null}
              {billingLoading ? (
                <div className="border-latte-surface2/70 bg-latte-base/45 flex items-center gap-2 rounded-xl border px-2.5 py-1.5">
                  <div className="bg-latte-subtext0 h-1.5 w-1.5 animate-pulse rounded-full" />
                  <p className="text-latte-subtext0 text-xs">Syncing billing data...</p>
                </div>
              ) : provider.billing.meta.source === "unavailable" ? (
                <Callout tone="warning" size="xs">
                  {provider.billing.meta.reasonMessage ?? "Not available for this provider yet."}
                </Callout>
              ) : null}
            </div>
          ) : null}
          {!provider && providerLoading ? (
            <div className="border-latte-surface2/70 bg-latte-base/35 space-y-2 rounded-2xl border px-3 py-2.5">
              <div className="bg-latte-surface2/80 h-3 w-20 animate-pulse rounded-sm" />
              <div className="bg-latte-surface1/80 h-2.5 w-full animate-pulse rounded-sm" />
              <div className="bg-latte-surface1/70 h-2.5 w-5/6 animate-pulse rounded-sm" />
              <p className="text-latte-subtext0 text-xs">Loading provider data...</p>
            </div>
          ) : null}
          {!provider && !providerLoading ? (
            <Callout tone="warning" size="sm">
              Provider data is not available right now.
            </Callout>
          ) : null}
          {provider && visibleWindows.length === 0 ? (
            <Callout tone="warning" size="sm">
              Usage windows are not available for this provider right now.
            </Callout>
          ) : null}
        </div>
      </section>
    </GlowCard>
  );
};
