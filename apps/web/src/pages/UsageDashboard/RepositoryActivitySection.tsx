import { useMemo, useState } from "react";
import type {
  UsageRepositoryActivityItem,
  UsageRepositoryActivityResponse,
} from "@vde-monitor/shared";

import { Button, Callout, GlowCard, Skeleton, TagPill } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatPath } from "@/lib/session-format";
import { formatDurationMs } from "@/lib/time-format";

import type { RepositoryActivityRange } from "./repository-activity-types";
import { formatDateTime } from "./usage-format";

type RepositoryActivityMetric = "activeTime" | "agentTime" | "completedRuns";

type RankedRepositoryActivityItem = {
  item: UsageRepositoryActivityItem;
  rank: number;
  value: number;
};

const numberFormatter = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
const REPOSITORY_ACTIVITY_SKELETON_ROWS = [0, 1, 2] as const;

const METRIC_DEFINITIONS: Record<
  RepositoryActivityMetric,
  {
    label: string;
    description: string;
    value: (item: UsageRepositoryActivityItem) => number;
    format: (value: number) => string;
  }
> = {
  activeTime: {
    label: "Active time",
    description: "Time when at least one lifecycle-confirmed agent run was active.",
    value: (item) => item.activeTimeMs,
    format: formatDurationMs,
  },
  agentTime: {
    label: "Agent time",
    description: "Confirmed running time summed across agents; parallel work counts separately.",
    value: (item) => item.agentTimeMs,
    format: formatDurationMs,
  },
  completedRuns: {
    label: "Completed runs",
    description: "Distinct runs with an explicit agent completion event.",
    value: (item) => item.completedRunCount,
    format: (value) => numberFormatter.format(value),
  },
};

const rankItems = (
  items: UsageRepositoryActivityItem[],
  metric: RepositoryActivityMetric,
): RankedRepositoryActivityItem[] => {
  const metricDefinition = METRIC_DEFINITIONS[metric];
  const sorted = [...items].sort((left, right) => {
    const valueDifference = metricDefinition.value(right) - metricDefinition.value(left);
    if (valueDifference !== 0) {
      return valueDifference;
    }
    const nameDifference = left.repoName.localeCompare(right.repoName);
    return nameDifference !== 0 ? nameDifference : left.repoRoot.localeCompare(right.repoRoot);
  });

  let previousValue: number | null = null;
  let rank = 0;
  return sorted.map((item, index) => {
    const value = metricDefinition.value(item);
    if (previousValue == null || value !== previousValue) {
      rank = index + 1;
      previousValue = value;
    }
    return { item, rank, value };
  });
};

const RangeTabs = ({
  value,
  onValueChange,
}: {
  value: RepositoryActivityRange;
  onValueChange: (value: RepositoryActivityRange) => void;
}) => (
  <div
    role="group"
    aria-label="Repository activity range"
    className="border-latte-surface2 bg-latte-surface0/60 inline-flex items-center gap-1 rounded-full border p-1"
  >
    {(["24h", "7d", "30d"] as const).map((range) => (
      <button
        key={range}
        type="button"
        aria-pressed={value === range}
        onClick={() => onValueChange(range)}
        className={cn(
          "text-latte-subtext0 inline-flex items-center justify-center rounded-full px-3 py-1 text-xs font-semibold transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-latte-lavender",
          "hover:bg-latte-surface1/70 hover:text-latte-text",
          value === range && "text-latte-text bg-latte-base/90 shadow-elev-1",
        )}
      >
        {range}
      </button>
    ))}
  </div>
);

const MetricTabs = ({
  value,
  onValueChange,
}: {
  value: RepositoryActivityMetric;
  onValueChange: (value: RepositoryActivityMetric) => void;
}) => (
  <div
    role="group"
    aria-label="Rank repositories by"
    className="border-latte-surface2 bg-latte-surface0/60 inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-full border p-1"
  >
    {(
      Object.entries(METRIC_DEFINITIONS) as Array<
        [RepositoryActivityMetric, (typeof METRIC_DEFINITIONS)[RepositoryActivityMetric]]
      >
    ).map(([metric, definition]) => (
      <button
        key={metric}
        type="button"
        aria-pressed={value === metric}
        onClick={() => onValueChange(metric)}
        className={cn(
          "text-latte-subtext0 inline-flex shrink-0 items-center justify-center rounded-full px-3 py-1 text-xs font-semibold transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-latte-lavender",
          "hover:bg-latte-surface1/70 hover:text-latte-text",
          value === metric && "text-latte-text bg-latte-base/90 shadow-elev-1",
        )}
      >
        {definition.label}
      </button>
    ))}
  </div>
);

const RepositoryActivitySkeleton = () => (
  <div aria-hidden="true" className="space-y-2">
    {REPOSITORY_ACTIVITY_SKELETON_ROWS.map((index) => (
      <div
        key={index}
        data-testid="repository-activity-skeleton-row"
        className="border-latte-surface2/60 bg-latte-base/25 min-h-[132px] rounded-2xl border px-3 py-3 sm:px-4"
      >
        <div className="flex items-start gap-3">
          <Skeleton className="h-7 w-7 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-2">
                <Skeleton className="h-4 w-40 max-w-[55vw]" />
                <Skeleton className="h-3 w-56 max-w-[65vw]" />
              </div>
              <div className="space-y-2 sm:flex sm:flex-col sm:items-end">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-4 w-16" />
              </div>
            </div>
            <Skeleton className="mt-3 h-2 w-full" />
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <Skeleton className="h-5 w-20" />
              <Skeleton className="h-5 w-20" />
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-5 w-28" />
            </div>
          </div>
        </div>
      </div>
    ))}
  </div>
);

const RepositoryActivityRow = ({
  rankedItem,
  leaderValue,
  metric,
}: {
  rankedItem: RankedRepositoryActivityItem;
  leaderValue: number;
  metric: RepositoryActivityMetric;
}) => {
  const { item, rank, value } = rankedItem;
  const metricDefinition = METRIC_DEFINITIONS[metric];
  const barWidth = leaderValue > 0 ? Math.max(0, Math.min(100, (value / leaderValue) * 100)) : 0;

  return (
    <li className="border-latte-surface2/65 bg-latte-base/35 rounded-2xl border px-3 py-3 sm:px-4">
      <div className="flex items-start gap-3">
        <span className="border-latte-surface2/75 bg-latte-crust/70 text-latte-subtext0 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-sm font-semibold tabular-nums">
          {rank}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
            <div className="min-w-0">
              <p className="text-latte-text truncate font-semibold">{item.repoName}</p>
              <p
                className="text-latte-subtext0 mt-0.5 truncate font-mono text-[11px]"
                title={item.repoRoot}
              >
                {formatPath(item.repoRoot)}
              </p>
            </div>
            <div className="shrink-0 sm:text-right">
              <p className="text-latte-subtext0 text-[10px] uppercase tracking-[0.18em]">
                {metricDefinition.label}
              </p>
              <p className="text-latte-text text-sm font-semibold tabular-nums">
                {metricDefinition.format(value)}
              </p>
            </div>
          </div>
          <div className="border-latte-surface2 bg-latte-crust/70 mt-2 h-2 overflow-hidden rounded-full border">
            <div
              className="from-latte-blue/85 to-latte-lavender/80 h-full bg-linear-to-r transition-[width] duration-300 motion-reduce:transition-none"
              style={{ width: `${barWidth}%` }}
              role="img"
              aria-label={`${item.repoName}: ${metricDefinition.format(value)}, ${Math.round(barWidth)}% of the leading repository`}
            />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <TagPill tone="meta">Active {formatDurationMs(item.activeTimeMs)}</TagPill>
            <TagPill tone="meta">Agent {formatDurationMs(item.agentTimeMs)}</TagPill>
            <TagPill tone="meta">
              {numberFormatter.format(item.completedRunCount)} completed
            </TagPill>
            {item.lastActiveAt ? (
              <TagPill tone="meta">Last active {formatDateTime(item.lastActiveAt)}</TagPill>
            ) : null}
          </div>
        </div>
      </div>
    </li>
  );
};

export const RepositoryActivitySection = ({
  activity,
  loading,
  error,
  range,
  onRangeChange,
}: {
  activity: UsageRepositoryActivityResponse | null;
  loading: boolean;
  error: string | null;
  range: RepositoryActivityRange;
  onRangeChange: (range: RepositoryActivityRange) => void;
}) => {
  const [metric, setMetric] = useState<RepositoryActivityMetric>("activeTime");
  const [showAll, setShowAll] = useState(false);
  const rankedItems = useMemo(
    () => rankItems(activity?.items ?? [], metric),
    [activity?.items, metric],
  );
  const visibleItems = showAll ? rankedItems : rankedItems.slice(0, 5);
  const leaderValue = rankedItems[0]?.value ?? 0;
  const coverage = activity?.coverage ?? null;

  return (
    <GlowCard contentClassName="gap-3">
      <section aria-labelledby="repository-activity-heading">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-2xl">
            <h2
              id="repository-activity-heading"
              className="font-display text-latte-text text-xl font-semibold"
            >
              Repository activity
            </h2>
            <p className="text-latte-subtext0 mt-1 text-xs leading-relaxed sm:text-sm">
              Agent state activity by repository. This is not token usage, cost, or productivity.
            </p>
          </div>
          <RangeTabs
            value={range}
            onValueChange={(nextRange) => {
              setShowAll(false);
              onRangeChange(nextRange);
            }}
          />
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <MetricTabs value={metric} onValueChange={setMetric} />
          <div className="text-latte-subtext0 text-[11px] leading-relaxed sm:text-right">
            <p>{METRIC_DEFINITIONS[metric].description}</p>
            <p>Bars are relative to the leading repository.</p>
          </div>
        </div>

        {coverage?.status === "partial" ? (
          <Callout tone="warning" size="xs" className="mt-3" role="status">
            Partial history only
            {coverage.trackingStartedAt
              ? `; tracking started ${formatDateTime(coverage.trackingStartedAt)}`
              : ""}
            {coverage.gapDurationMs > 0
              ? `, with ${formatDurationMs(coverage.gapDurationMs)} not observed`
              : ""}
            .
          </Callout>
        ) : null}
        {coverage && coverage.unattributedRunningMs > 0 ? (
          <Callout tone="warning" size="xs" className="mt-2" role="status">
            {formatDurationMs(coverage.unattributedRunningMs)} of agent activity could not be
            attributed to a repository and is excluded.
          </Callout>
        ) : null}
        {coverage && coverage.unattributedCompletedRunCount > 0 ? (
          <Callout tone="warning" size="xs" className="mt-2" role="status">
            {numberFormatter.format(coverage.unattributedCompletedRunCount)} explicit completion
            {coverage.unattributedCompletedRunCount === 1 ? "" : "s"} could not be attributed to a
            repository and {coverage.unattributedCompletedRunCount === 1 ? "is" : "are"} excluded.
          </Callout>
        ) : null}

        {error ? (
          <Callout tone="error" size="sm" className="mt-3" role="alert">
            {error}
          </Callout>
        ) : null}

        {loading && activity == null ? (
          <span role="status" aria-label="Loading repository activity" className="sr-only">
            Loading repository activity
          </span>
        ) : null}
        <div data-testid="repository-activity-content" className="mt-3" aria-busy={loading}>
          {loading && activity == null ? (
            <RepositoryActivitySkeleton />
          ) : rankedItems.length > 0 ? (
            <>
              <ol className="space-y-2">
                {visibleItems.map((rankedItem) => (
                  <RepositoryActivityRow
                    key={rankedItem.item.repoKey}
                    rankedItem={rankedItem}
                    leaderValue={leaderValue}
                    metric={metric}
                  />
                ))}
              </ol>
              {rankedItems.length > 5 ? (
                <div className="mt-3 flex justify-center">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowAll((current) => !current)}
                    aria-expanded={showAll}
                  >
                    {showAll ? "Show top 5" : `Show all ${rankedItems.length}`}
                  </Button>
                </div>
              ) : null}
            </>
          ) : error == null ? (
            <p className="text-latte-subtext0 py-4 text-center text-sm">
              No repository activity in this range.
            </p>
          ) : null}
        </div>

        {activity?.fetchedAt ? (
          <p className="text-latte-subtext0 mt-3 text-right text-[11px]">
            Updated {formatDateTime(activity.fetchedAt)}
          </p>
        ) : null}
      </section>
    </GlowCard>
  );
};
