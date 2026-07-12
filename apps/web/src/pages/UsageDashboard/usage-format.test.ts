import type { UsageMetricWindow, UsageProviderSnapshot } from "@vde-monitor/shared";
import { describe, expect, it } from "vitest";

import { formatDurationMs } from "@/lib/time-format";

import {
  aggregateBillingBreakdownRows,
  clampPercent,
  formatBufferLabel,
  formatPaceLabel,
  formatPercent,
  formatResetAt,
  formatResetIn,
  formatTokenCount,
  formatTokens,
  formatUsedElapsedLabel,
  resolveRemainingBufferPercent,
  resolveWeekStartLocal,
} from "./usage-format";

type BillingBreakdownRow = UsageProviderSnapshot["billing"]["dailyBreakdown"][number];

const createMetric = (overrides: Partial<UsageMetricWindow> = {}): UsageMetricWindow => ({
  id: "session",
  title: "Session",
  utilizationPercent: 40,
  windowDurationMs: 300 * 60 * 1000,
  resetsAt: "2026-02-27T01:00:00.000Z",
  pace: {
    elapsedPercent: 55.25,
    projectedEndUtilizationPercent: 72.4,
    paceMarginPercent: 27.6,
    status: "margin",
  },
  ...overrides,
});

const createBreakdownRow = (
  date: string,
  overrides: Partial<BillingBreakdownRow> = {},
): BillingBreakdownRow => ({
  date,
  modelIds: ["claude-sonnet"],
  inputTokens: 10,
  outputTokens: 20,
  cacheCreationInputTokens: 30,
  cacheReadInputTokens: 40,
  totalTokens: 100,
  usd: 1.5,
  ...overrides,
});

describe("usage-format", () => {
  it("formats percentages, durations, reset labels, and token counts", () => {
    expect(formatPercent(null)).toBe("Not available");
    expect(formatPercent(12.34)).toBe("12.3%");
    expect(formatPercent(-12.34, true)).toBe("-12.3%");
    expect(formatPercent(12, true)).toBe("+12%");
    expect(formatDurationMs(0)).toBe("0s");
    expect(formatDurationMs(90_000)).toBe("1m");
    expect(formatDurationMs(25 * 60 * 60 * 1000)).toBe("1d 1h");
    expect(formatResetIn("2026-02-27T01:00:00.000Z", Date.parse("2026-02-27T00:00:00.000Z"))).toBe(
      "Resets in 1h",
    );
    expect(formatResetAt(new Date(2026, 1, 27, 10, 5).toISOString())).toBe("Feb 27 · 10:05");
    expect(formatResetAt(null)).toBeNull();
    expect(formatResetAt("invalid")).toBeNull();
    expect(formatTokens(1234.6)).toBe("1,235 tokens");
    expect(formatTokenCount(1234.4)).toBe("1,234");
  });

  it("clamps percentages and renders pace labels from current metric values", () => {
    const metric = createMetric();

    expect(clampPercent(-5)).toBe(0);
    expect(clampPercent(105)).toBe(100);
    expect(resolveRemainingBufferPercent(metric)).toBe(15.3);
    expect(formatBufferLabel(15.3)).toBe("Buffer +15.3%");
    expect(formatPaceLabel(metric)).toBe("Pace +27.6% margin");
    expect(formatUsedElapsedLabel(metric)).toBe("40% / 55.3%");
  });

  it("handles unavailable buffer and pace values", () => {
    const metric = createMetric({
      utilizationPercent: null,
      pace: {
        elapsedPercent: null,
        projectedEndUtilizationPercent: null,
        paceMarginPercent: null,
        status: "unknown",
      },
    });

    expect(resolveRemainingBufferPercent(metric)).toBeNull();
    expect(formatBufferLabel(null)).toBe("Buffer unavailable");
    expect(formatPaceLabel(metric)).toBe("Pace unavailable");
    expect(formatUsedElapsedLabel(metric)).toBe("-- / --");
  });

  it("resolves local week starts on Monday", () => {
    const weekStart = resolveWeekStartLocal(new Date(2026, 1, 25, 12, 0, 0));

    expect(weekStart.getDay()).toBe(1);
    expect(weekStart.getHours()).toBe(0);
    expect(weekStart.getMinutes()).toBe(0);
  });

  it("aggregates billing breakdown rows by period and skips invalid dates", () => {
    const rows = [
      createBreakdownRow("2026-02-24", {
        modelIds: ["b-model", "a-model"],
      }),
      createBreakdownRow("2026-02-25", {
        modelIds: ["a-model"],
        inputTokens: 1,
        outputTokens: 2,
        cacheCreationInputTokens: 3,
        cacheReadInputTokens: 4,
        totalTokens: 10,
        usd: null,
      }),
      createBreakdownRow("invalid-date", {
        totalTokens: 999,
      }),
    ];

    const daily = aggregateBillingBreakdownRows(rows, "daily");
    expect(daily).toHaveLength(2);
    expect(daily[0]).toMatchObject({
      modelIds: ["a-model"],
      inputTokens: 1,
      totalTokens: 10,
      usd: null,
    });
    expect(daily[1]).toMatchObject({
      modelIds: ["a-model", "b-model"],
      inputTokens: 10,
      totalTokens: 100,
      usd: 1.5,
    });

    const weekly = aggregateBillingBreakdownRows(rows, "weekly");
    expect(weekly).toHaveLength(1);
    expect(weekly[0]).toMatchObject({
      modelIds: ["a-model", "b-model"],
      inputTokens: 11,
      outputTokens: 22,
      cacheCreationInputTokens: 33,
      cacheReadInputTokens: 44,
      totalTokens: 110,
      usd: 1.5,
    });
  });

  it("sorts billing breakdown rows by newest period first", () => {
    const rows = [
      createBreakdownRow("2025-12-15", { totalTokens: 100 }),
      createBreakdownRow("2026-02-15", { totalTokens: 300 }),
      createBreakdownRow("2026-01-15", { totalTokens: 200 }),
    ];

    expect(aggregateBillingBreakdownRows(rows, "daily").map((row) => row.totalTokens)).toEqual([
      300, 200, 100,
    ]);
    expect(aggregateBillingBreakdownRows(rows, "weekly").map((row) => row.totalTokens)).toEqual([
      300, 200, 100,
    ]);
    expect(aggregateBillingBreakdownRows(rows, "monthly").map((row) => row.totalTokens)).toEqual([
      300, 200, 100,
    ]);
  });
});
