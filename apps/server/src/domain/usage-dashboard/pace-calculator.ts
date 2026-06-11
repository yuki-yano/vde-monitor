import type { UsageMetricWindow, UsagePaceStatus } from "@vde-monitor/shared";

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const roundOne = (value: number) => Math.round(value * 10) / 10;

export const derivePace = ({
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

export const createUsageMetricWindow = ({
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
