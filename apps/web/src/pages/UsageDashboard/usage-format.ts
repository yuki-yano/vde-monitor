import type { UsageMetricWindow, UsageProviderSnapshot } from "@vde-monitor/shared";

import { formatDurationMs } from "@/lib/time-format";

const BUFFER_BALANCED_THRESHOLD = 5;

export const clampPercent = (value: number) => Math.max(0, Math.min(100, value));
export const roundOne = (value: number) => Math.round(value * 10) / 10;

const usdFormatter = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const tokenFormatter = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 0,
});

const resetDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});

const resetTimeFormatter = new Intl.DateTimeFormat("en-US", {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export const formatPercent = (value: number | null, signed = false) => {
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

export const formatCompactPercent = (value: number | null) => {
  if (value == null) {
    return "--";
  }
  const abs = Math.abs(value);
  const rendered = Number.isInteger(abs) ? String(abs) : abs.toFixed(1);
  return `${rendered}%`;
};

export const formatResetIn = (resetsAt: string | null, nowMs: number) => {
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

export const formatResetAt = (resetsAt: string | null) => {
  if (!resetsAt) {
    return null;
  }
  const resetsAtMs = Date.parse(resetsAt);
  if (Number.isNaN(resetsAtMs)) {
    return null;
  }
  const resetAt = new Date(resetsAtMs);
  return `${resetDateFormatter.format(resetAt)} · ${resetTimeFormatter.format(resetAt)}`;
};

export const formatDateTime = (iso: string | null | undefined) => {
  if (!iso) {
    return "Not available";
  }
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) {
    return "Not available";
  }
  return new Date(parsed).toLocaleString();
};

export const formatUsd = (value: number | null) => {
  if (value == null) {
    return "Not available";
  }
  return usdFormatter.format(value);
};

export const formatTokens = (value: number | null) => {
  if (value == null) {
    return "Not available";
  }
  return `${tokenFormatter.format(Math.round(value))} tokens`;
};

export const formatTokenCount = (value: number) => tokenFormatter.format(Math.round(value));

export type BillingBreakdownGranularity = "daily" | "weekly" | "monthly";
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

const toLocalDayStart = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());

const formatLocalDayKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const formatLocalDay = (date: Date) => date.toLocaleDateString();

const formatLocalMonth = (date: Date) =>
  date.toLocaleDateString([], {
    year: "numeric",
    month: "2-digit",
  });

export const resolveWeekStartLocal = (date: Date) => {
  const shifted = new Date(date);
  const weekday = (shifted.getDay() + 6) % 7;
  shifted.setDate(shifted.getDate() - weekday);
  shifted.setHours(0, 0, 0, 0);
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
  const localDayStart = toLocalDayStart(parsed);
  if (granularity === "daily") {
    return {
      key: formatLocalDayKey(localDayStart),
      label: formatLocalDay(localDayStart),
      startMs: localDayStart.getTime(),
    };
  }
  if (granularity === "weekly") {
    const start = resolveWeekStartLocal(localDayStart);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    const startText = formatLocalDay(start);
    const endText = formatLocalDay(end);
    return {
      key: formatLocalDayKey(start),
      label: `${startText} - ${endText}`,
      startMs: start.getTime(),
    };
  }
  const monthKey = `${localDayStart.getFullYear()}-${String(localDayStart.getMonth() + 1).padStart(2, "0")}`;
  const monthStart = new Date(localDayStart.getFullYear(), localDayStart.getMonth(), 1);
  return {
    key: monthKey,
    label: formatLocalMonth(monthStart),
    startMs: monthStart.getTime(),
  };
};

export const aggregateBillingBreakdownRows = (
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
    .sort((left, right) => right.startMs - left.startMs)
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

export const resolveModelStrategyLabel = (
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

export const resolveCostSourceLabel = (
  source: UsageProviderSnapshot["billing"]["meta"]["source"],
) => {
  if (source === "actual") {
    return "Actual";
  }
  if (source === "estimated") {
    return "Estimated";
  }
  return "Unavailable";
};

export const resolveCostSourceTone = (
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

const resolveRelativeTone = (deltaPercent: number | null) => {
  if (deltaPercent == null) {
    return "unknown" as const;
  }
  if (deltaPercent > BUFFER_BALANCED_THRESHOLD) {
    return "ahead" as const;
  }
  if (deltaPercent < -BUFFER_BALANCED_THRESHOLD) {
    return "behind" as const;
  }
  return "balanced" as const;
};

export const resolveUsageColor = (remainingBufferPercent: number | null) => {
  const tone = resolveRelativeTone(remainingBufferPercent);
  if (tone === "unknown") {
    return "bg-latte-surface1/80";
  }
  if (tone === "ahead") {
    return "bg-latte-green/85";
  }
  if (tone === "balanced") {
    return "bg-latte-yellow/85";
  }
  return "bg-latte-red/85";
};

export const resolvePaceTone = (
  paceStatus: UsageMetricWindow["pace"]["status"],
  paceMarginPercent: number | null,
) => {
  const tone = resolveRelativeTone(paceMarginPercent);
  if (tone === "ahead") {
    return "bg-latte-green/15 text-latte-green-text border-latte-green/40";
  }
  if (tone === "behind") {
    return "bg-latte-red/15 text-latte-red-text border-latte-red/40";
  }
  if (tone === "balanced") {
    return "bg-latte-yellow/15 text-latte-yellow-text border-latte-yellow/40";
  }
  if (paceStatus === "margin") {
    return "bg-latte-green/15 text-latte-green-text border-latte-green/40";
  }
  if (paceStatus === "over") {
    return "bg-latte-red/15 text-latte-red-text border-latte-red/40";
  }
  if (paceStatus === "balanced") {
    return "bg-latte-yellow/15 text-latte-yellow-text border-latte-yellow/40";
  }
  return "bg-latte-surface1/70 text-latte-subtext0 border-latte-surface2";
};

export const resolveBufferTone = (bufferPercent: number | null) => {
  const tone = resolveRelativeTone(bufferPercent);
  if (tone === "unknown") {
    return "bg-latte-surface1/70 text-latte-subtext0 border-latte-surface2";
  }
  if (tone === "ahead") {
    return "bg-latte-green/15 text-latte-green-text border-latte-green/40";
  }
  if (tone === "behind") {
    return "bg-latte-red/15 text-latte-red-text border-latte-red/40";
  }
  return "bg-latte-yellow/15 text-latte-yellow-text border-latte-yellow/40";
};

export const resolveRemainingBufferPercent = (metric: UsageMetricWindow): number | null => {
  if (metric.utilizationPercent == null || metric.pace.elapsedPercent == null) {
    return null;
  }
  return roundOne(metric.pace.elapsedPercent - metric.utilizationPercent);
};

export const formatBufferLabel = (bufferPercent: number | null) => {
  if (bufferPercent == null) {
    return "Buffer unavailable";
  }
  return `Buffer ${formatPercent(bufferPercent, true)}`;
};

export const formatPaceLabel = (metric: UsageMetricWindow) => {
  const paceMargin = metric.pace.paceMarginPercent;
  if (paceMargin == null) {
    return "Pace unavailable";
  }
  if (paceMargin >= 0) {
    return `Pace ${formatPercent(paceMargin, true)} margin`;
  }
  return `Pace ${formatPercent(paceMargin, true)} over`;
};

export const formatUsedElapsedLabel = (metric: UsageMetricWindow) =>
  `${formatCompactPercent(metric.utilizationPercent)} / ${formatCompactPercent(metric.pace.elapsedPercent)}`;
