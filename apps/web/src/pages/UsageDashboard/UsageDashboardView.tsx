import { Link } from "@tanstack/react-router";
import type {
  SessionStateTimelineItem,
  SessionStateTimelineRange,
  SessionStateValue,
  UsageMetricWindow,
  UsageProviderSnapshot,
} from "@vde-monitor/shared";
import { ArrowLeft, ChevronDown, ChevronUp, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";

import { ThemeToggle } from "@/components/theme-toggle";
import {
  Badge,
  Button,
  Callout,
  GlowCard,
  PanelSection,
  Tabs,
  TabsList,
  TabsTrigger,
  TagPill,
} from "@/components/ui";
import { buildTimelineDisplay } from "@/features/shared-session-ui/components/state-timeline-display";
import { readStoredSessionListFilter } from "@/features/shared-session-ui/model/session-list-filters";
import { cn } from "@/lib/cn";
import { formatStateLabel, stateTone } from "@/lib/session-format";
import { backLinkClass } from "@/pages/SessionDetail/sessionDetailUtils";

import type { UsageDashboardVM } from "./useUsageDashboardVM";

const RANGE_MS: Record<SessionStateTimelineRange, number> = {
  "15m": 15 * 60 * 1000,
  "1h": 60 * 60 * 1000,
  "3h": 3 * 60 * 60 * 1000,
  "6h": 6 * 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "3d": 3 * 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
};

const SEGMENT_COLOR_CLASS: Record<SessionStateValue, string> = {
  RUNNING: "bg-latte-green/80",
  WAITING_INPUT: "bg-latte-peach/80",
  WAITING_PERMISSION: "bg-latte-red/80",
  SHELL: "bg-latte-blue/80",
  UNKNOWN: "bg-latte-overlay0/80",
};

const UTILIZATION_LOW_THRESHOLD = 60;
const UTILIZATION_HIGH_THRESHOLD = 85;
const BUFFER_BALANCED_THRESHOLD = 1;

const clampPercent = (value: number) => Math.max(0, Math.min(100, value));
const roundOne = (value: number) => Math.round(value * 10) / 10;

const usdFormatter = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const tokenFormatter = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 0,
});

const formatPercent = (value: number | null, signed = false) => {
  if (value == null) {
    return "Not available";
  }
  const abs = Math.abs(value);
  const rendered = Number.isInteger(abs) ? String(abs) : abs.toFixed(1);
  if (!signed) {
    return `${rendered}%`;
  }
  if (value > 0) {
    return `+${rendered}%`;
  }
  if (value < 0) {
    return `-${rendered}%`;
  }
  return "0%";
};

const formatCompactPercent = (value: number | null) => {
  if (value == null) {
    return "--";
  }
  const abs = Math.abs(value);
  const rendered = Number.isInteger(abs) ? String(abs) : abs.toFixed(1);
  return `${rendered}%`;
};

const formatDurationMs = (durationMs: number) => {
  if (durationMs <= 0) {
    return "0s";
  }
  const seconds = Math.floor(durationMs / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  if (hours < 24) {
    return restMinutes > 0 ? `${hours}h ${restMinutes}m` : `${hours}h`;
  }
  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  return restHours > 0 ? `${days}d ${restHours}h` : `${days}d`;
};

const formatResetIn = (resetsAt: string | null, nowMs: number) => {
  if (!resetsAt) {
    return "Reset time unavailable";
  }
  const resetsAtMs = Date.parse(resetsAt);
  if (Number.isNaN(resetsAtMs)) {
    return "Reset time unavailable";
  }
  const remainingMs = Math.max(0, resetsAtMs - nowMs);
  return `Resets in ${formatDurationMs(remainingMs)}`;
};

const formatTime = (iso: string | null) => {
  if (!iso) {
    return "ongoing";
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
};

const formatDateTime = (iso: string | null | undefined) => {
  if (!iso) {
    return "Not available";
  }
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) {
    return "Not available";
  }
  return new Date(parsed).toLocaleString();
};

const formatUsd = (value: number | null) => {
  if (value == null) {
    return "Not available";
  }
  return usdFormatter.format(value);
};

const formatTokens = (value: number | null) => {
  if (value == null) {
    return "Not available";
  }
  return `${tokenFormatter.format(Math.round(value))} tokens`;
};

const formatTokenCount = (value: number) => tokenFormatter.format(Math.round(value));

type BillingBreakdownGranularity = "daily" | "weekly" | "monthly";
type BillingBreakdownRow = UsageProviderSnapshot["billing"]["dailyBreakdown"][number];
type BillingBreakdownAggregate = {
  date: string;
  modelIds: Set<string>;
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
  totalTokens: number;
  usdSum: number;
  startMs: number;
  hasUsd: boolean;
};

const parseUtcDay = (value: string): Date | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }
  return parsed;
};

const formatUtcDay = (date: Date) => {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const resolveWeekStartUtc = (date: Date) => {
  const shifted = new Date(date);
  const weekday = (shifted.getUTCDay() + 6) % 7;
  shifted.setUTCDate(shifted.getUTCDate() - weekday);
  shifted.setUTCHours(0, 0, 0, 0);
  return shifted;
};

const resolveBreakdownBucket = (
  dateText: string,
  granularity: BillingBreakdownGranularity,
): { key: string; label: string; startMs: number } | null => {
  const parsed = parseUtcDay(dateText);
  if (!parsed) {
    return null;
  }
  if (granularity === "daily") {
    return {
      key: dateText,
      label: dateText,
      startMs: parsed.getTime(),
    };
  }
  if (granularity === "weekly") {
    const start = resolveWeekStartUtc(parsed);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 6);
    const startText = formatUtcDay(start);
    const endText = formatUtcDay(end);
    return {
      key: startText,
      label: `${startText} - ${endText}`,
      startMs: start.getTime(),
    };
  }
  const monthKey = `${parsed.getUTCFullYear()}-${String(parsed.getUTCMonth() + 1).padStart(2, "0")}`;
  const monthStart = new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), 1));
  return {
    key: monthKey,
    label: monthKey,
    startMs: monthStart.getTime(),
  };
};

const aggregateBillingBreakdownRows = (
  rows: BillingBreakdownRow[],
  granularity: BillingBreakdownGranularity,
): BillingBreakdownRow[] => {
  const map = new Map<string, BillingBreakdownAggregate>();
  for (const row of rows) {
    const bucket = resolveBreakdownBucket(row.date, granularity);
    if (!bucket) {
      continue;
    }
    const target =
      map.get(bucket.key) ??
      (() => {
        const created: BillingBreakdownAggregate = {
          date: bucket.label,
          modelIds: new Set<string>(),
          inputTokens: 0,
          outputTokens: 0,
          cacheCreationInputTokens: 0,
          cacheReadInputTokens: 0,
          totalTokens: 0,
          usdSum: 0,
          startMs: bucket.startMs,
          hasUsd: false,
        };
        map.set(bucket.key, created);
        return created;
      })();

    row.modelIds.forEach((modelId) => target.modelIds.add(modelId));
    target.inputTokens += row.inputTokens;
    target.outputTokens += row.outputTokens;
    target.cacheCreationInputTokens += row.cacheCreationInputTokens;
    target.cacheReadInputTokens += row.cacheReadInputTokens;
    target.totalTokens += row.totalTokens;
    if (row.usd != null) {
      target.usdSum += row.usd;
      target.hasUsd = true;
    }
  }

  return Array.from(map.values())
    .sort((left, right) => left.startMs - right.startMs)
    .map((entry) => ({
      date: entry.date,
      modelIds: Array.from(entry.modelIds).sort(),
      inputTokens: entry.inputTokens,
      outputTokens: entry.outputTokens,
      cacheCreationInputTokens: entry.cacheCreationInputTokens,
      cacheReadInputTokens: entry.cacheReadInputTokens,
      totalTokens: entry.totalTokens,
      usd: entry.hasUsd ? entry.usdSum : null,
    }));
};

const resolveModelStrategyLabel = (
  strategy: UsageProviderSnapshot["billing"]["modelBreakdown"][number]["resolveStrategy"],
) => {
  if (strategy === "exact") {
    return "Exact";
  }
  if (strategy === "prefix") {
    return "Prefix";
  }
  if (strategy === "alias") {
    return "Alias";
  }
  return "Fallback";
};

const resolveCostSourceLabel = (source: UsageProviderSnapshot["billing"]["meta"]["source"]) => {
  if (source === "actual") {
    return "Actual";
  }
  if (source === "estimated") {
    return "Estimated";
  }
  return "Unavailable";
};

const resolveCostSourceTone = (
  source: UsageProviderSnapshot["billing"]["meta"]["source"],
): "danger" | "meta" | "neutral" => {
  if (source === "actual") {
    return "neutral";
  }
  if (source === "estimated") {
    return "meta";
  }
  return "danger";
};

const resolveUsageColor = (utilizationPercent: number | null) => {
  if (utilizationPercent == null) {
    return "bg-latte-surface1/80";
  }
  if (utilizationPercent < UTILIZATION_LOW_THRESHOLD) {
    return "bg-latte-green/85";
  }
  if (utilizationPercent < UTILIZATION_HIGH_THRESHOLD) {
    return "bg-latte-yellow/85";
  }
  return "bg-latte-red/85";
};

const resolvePaceTone = (paceStatus: UsageMetricWindow["pace"]["status"]) => {
  if (paceStatus === "margin") {
    return "bg-latte-green/15 text-latte-green border-latte-green/40";
  }
  if (paceStatus === "over") {
    return "bg-latte-red/15 text-latte-red border-latte-red/40";
  }
  if (paceStatus === "balanced") {
    return "bg-latte-yellow/15 text-latte-yellow border-latte-yellow/40";
  }
  return "bg-latte-surface1/70 text-latte-subtext0 border-latte-surface2";
};

const resolveBufferTone = (bufferPercent: number | null) => {
  if (bufferPercent == null) {
    return "bg-latte-surface1/70 text-latte-subtext0 border-latte-surface2";
  }
  if (bufferPercent > BUFFER_BALANCED_THRESHOLD) {
    return "bg-latte-green/15 text-latte-green border-latte-green/40";
  }
  if (bufferPercent < -BUFFER_BALANCED_THRESHOLD) {
    return "bg-latte-red/15 text-latte-red border-latte-red/40";
  }
  return "bg-latte-yellow/15 text-latte-yellow border-latte-yellow/40";
};

const resolveRemainingBufferPercent = (metric: UsageMetricWindow): number | null => {
  if (metric.utilizationPercent == null || metric.pace.elapsedPercent == null) {
    return null;
  }
  return roundOne(metric.pace.elapsedPercent - metric.utilizationPercent);
};

const renderBufferLabel = (bufferPercent: number | null) => {
  if (bufferPercent == null) {
    return "Buffer unavailable";
  }
  return `Buffer ${formatPercent(bufferPercent, true)}`;
};

const renderPaceLabel = (metric: UsageMetricWindow) => {
  const paceMargin = metric.pace.paceMarginPercent;
  if (paceMargin == null) {
    return "Pace unavailable";
  }
  if (paceMargin >= 0) {
    return `Pace ${formatPercent(paceMargin, true)} margin`;
  }
  return `Pace ${formatPercent(paceMargin, true)} over`;
};

const renderUsedElapsedLabel = (metric: UsageMetricWindow) =>
  `${formatCompactPercent(metric.utilizationPercent)} / ${formatCompactPercent(metric.pace.elapsedPercent)}`;

const resolveTimelineSegments = (
  items: SessionStateTimelineItem[],
  range: SessionStateTimelineRange,
) => {
  const rangeMs = RANGE_MS[range];
  return [...items]
    .sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt))
    .map((item) => {
      if (item.durationMs <= 0) {
        return null;
      }
      return {
        item,
        width: (item.durationMs / rangeMs) * 100,
      };
    })
    .filter((item): item is { item: SessionStateTimelineItem; width: number } => item != null);
};

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
            className={cn("h-full transition-[width]", resolveUsageColor(utilization))}
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
          {renderUsedElapsedLabel(metric)}
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
          {renderBufferLabel(bufferPercent)}
        </span>
        <span
          className={cn(
            "inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold",
            resolvePaceTone(metric.pace.status),
          )}
        >
          {renderPaceLabel(metric)}
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
              <TagPill tone={row.resolveStrategy === "exact" ? "neutral" : "meta"}>
                {resolveModelStrategyLabel(row.resolveStrategy)}
              </TagPill>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const ProviderQuotaSection = ({
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
                      <div className="bg-latte-surface2/80 h-3.5 w-20 animate-pulse rounded" />
                      <div className="bg-latte-surface1/80 h-2.5 w-16 animate-pulse rounded" />
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
                      <div className="bg-latte-surface2/80 h-3.5 w-24 animate-pulse rounded" />
                      <div className="bg-latte-surface1/80 h-2.5 w-20 animate-pulse rounded" />
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
              <div className="bg-latte-surface2/80 h-3 w-20 animate-pulse rounded" />
              <div className="bg-latte-surface1/80 h-2.5 w-full animate-pulse rounded" />
              <div className="bg-latte-surface1/70 h-2.5 w-5/6 animate-pulse rounded" />
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

const timelineRangeTabs = (
  timelineRange: SessionStateTimelineRange,
  onTimelineRangeChange: (range: SessionStateTimelineRange) => void,
) => (
  <Tabs
    value={timelineRange}
    onValueChange={(value) => {
      if (
        value === "15m" ||
        value === "1h" ||
        value === "3h" ||
        value === "6h" ||
        value === "24h" ||
        value === "3d" ||
        value === "7d"
      ) {
        onTimelineRangeChange(value);
      }
    }}
  >
    <TabsList aria-label="Timeline range">
      <TabsTrigger value="15m">15m</TabsTrigger>
      <TabsTrigger value="1h">1h</TabsTrigger>
      <TabsTrigger value="3h">3h</TabsTrigger>
      <TabsTrigger value="6h">6h</TabsTrigger>
      <TabsTrigger value="24h">24h</TabsTrigger>
      <TabsTrigger value="3d">3d</TabsTrigger>
      <TabsTrigger value="7d">7d</TabsTrigger>
    </TabsList>
  </Tabs>
);

export const UsageDashboardView = ({
  dashboard,
  dashboardLoading,
  billingLoadingByProvider,
  dashboardError,
  timeline,
  timelineLoading,
  timelineError,
  timelineRange,
  compactTimeline,
  nowMs,
  onTimelineRangeChange,
  onToggleCompactTimeline,
  onRefreshAll,
}: UsageDashboardVM) => {
  const timelineDisplay = useMemo(
    () =>
      buildTimelineDisplay(timeline?.timeline ?? null, timelineRange, { compact: compactTimeline }),
    [compactTimeline, timeline?.timeline, timelineRange],
  );

  const timelineSegments = useMemo(
    () => resolveTimelineSegments(timelineDisplay.items, timelineRange),
    [timelineDisplay.items, timelineRange],
  );

  const waitingMs =
    timelineDisplay.totalsMs.WAITING_INPUT + timelineDisplay.totalsMs.WAITING_PERMISSION;
  const timelineItems = compactTimeline ? timelineDisplay.items.slice(0, 6) : timelineDisplay.items;
  const codexProvider =
    dashboard?.providers.find((provider) => provider.providerId === "codex") ?? null;
  const claudeProvider =
    dashboard?.providers.find((provider) => provider.providerId === "claude") ?? null;
  const backToListSearch = { filter: readStoredSessionListFilter() };

  return (
    <main className="animate-fade-in-up w-full px-2.5 pb-7 pt-3.5 sm:px-4 sm:pb-10 sm:pt-6 md:px-6">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 sm:gap-6">
        <div className="flex items-center justify-between gap-3">
          <Link to="/" search={backToListSearch} className={backLinkClass}>
            <ArrowLeft className="h-4 w-4" />
            Back to list
          </Link>
          <ThemeToggle />
        </div>
        <header className="shadow-glass border-latte-surface1/60 bg-latte-base/80 flex flex-wrap items-center justify-between gap-3 rounded-3xl border p-4 backdrop-blur sm:p-6">
          <div>
            <p className="text-latte-subtext0 text-xs tracking-[0.28em]">VDE Monitor</p>
            <h1 className="font-display text-latte-text text-3xl font-semibold tracking-tight sm:text-4xl">
              Usage Dashboard
            </h1>
            <p className="text-latte-subtext1 mt-1 text-sm">
              Monitor Codex / Claude limits and usage pace.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={onRefreshAll}
              aria-label="Refresh usage dashboard"
              title="Refresh usage dashboard"
            >
              <RefreshCw
                className={cn(
                  "h-3.5 w-3.5",
                  (dashboardLoading || timelineLoading) && "animate-spin",
                )}
              />
            </Button>
          </div>
        </header>

        {dashboardError ? (
          <Callout tone="error" size="sm">
            {dashboardError}
          </Callout>
        ) : null}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <ProviderQuotaSection
            title="Codex"
            provider={codexProvider}
            nowMs={nowMs}
            providerLoading={dashboardLoading}
            billingLoading={billingLoadingByProvider.codex}
          />
          <ProviderQuotaSection
            title="Claude"
            provider={claudeProvider}
            nowMs={nowMs}
            providerLoading={dashboardLoading}
            billingLoading={billingLoadingByProvider.claude}
          />
        </div>

        <GlowCard contentClassName="gap-3">
          <section>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-latte-text text-xl font-semibold">
                Global State Timeline
              </h2>
              <p className="text-latte-subtext0 text-xs">
                Aggregated across all sessions ({timeline?.paneCount ?? 0} total /{" "}
                {timeline?.activePaneCount ?? 0} active)
              </p>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {timelineRangeTabs(timelineRange, onTimelineRangeChange)}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onToggleCompactTimeline}
                className={cn(
                  "transition-all duration-200",
                  compactTimeline
                    ? "border-latte-lavender/85 bg-latte-lavender/22 text-latte-lavender ring-latte-lavender/35 hover:border-latte-lavender hover:bg-latte-lavender/28 shadow-accent ring-1"
                    : "border-latte-surface2/70 text-latte-subtext0 hover:border-latte-overlay1 hover:bg-latte-base/85 hover:text-latte-text",
                )}
              >
                Compact
              </Button>
            </div>
            {timelineError ? (
              <Callout tone="error" size="sm" className="mt-3">
                {timelineError}
              </Callout>
            ) : null}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <TagPill tone="meta">Waiting {formatDurationMs(waitingMs)}</TagPill>
              <TagPill tone="meta">
                Running {formatDurationMs(timelineDisplay.totalsMs.RUNNING)}
              </TagPill>
              {timeline?.fetchedAt ? (
                <TagPill tone="meta">Updated {formatDateTime(timeline.fetchedAt)}</TagPill>
              ) : null}
            </div>
            <div className="border-latte-surface2 bg-latte-crust/70 mt-3 flex h-2 overflow-hidden rounded-full border">
              {timelineSegments.length === 0 ? (
                <div className="bg-latte-surface1/80 h-full w-full" />
              ) : (
                timelineSegments.map((segment) => (
                  <div
                    key={segment.item.id}
                    className={SEGMENT_COLOR_CLASS[segment.item.state]}
                    style={{ width: `${segment.width}%` }}
                    title={`${formatStateLabel(segment.item.state)} (${formatDurationMs(segment.item.durationMs)})`}
                  />
                ))
              )}
            </div>
            <div className="mt-3 space-y-1.5">
              {timelineItems.length > 0 ? (
                timelineItems.map((item) => (
                  <PanelSection
                    key={item.id}
                    className="border-latte-surface2/60 rounded-2xl border"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2">
                        <Badge tone={stateTone(item.state)} size="sm" animateIcon={false}>
                          {formatStateLabel(item.state)}
                        </Badge>
                        <span className="text-latte-subtext0 truncate text-xs">{item.reason}</span>
                      </div>
                      <TagPill tone="meta">{formatDurationMs(item.durationMs)}</TagPill>
                    </div>
                    <p className="text-latte-subtext0 mt-1 text-xs">
                      {formatTime(item.startedAt)} - {formatTime(item.endedAt)}
                    </p>
                  </PanelSection>
                ))
              ) : (
                <p className="text-latte-subtext0 text-sm">No timeline events in this range.</p>
              )}
            </div>
          </section>
        </GlowCard>
      </div>
    </main>
  );
};
