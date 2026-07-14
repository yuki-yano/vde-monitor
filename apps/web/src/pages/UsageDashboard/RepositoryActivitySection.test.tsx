import { fireEvent, render, screen, within } from "@testing-library/react";
import type { UsageRepositoryActivityResponse } from "@vde-monitor/shared";
import { describe, expect, it, vi } from "vitest";

import { RepositoryActivitySection } from "./RepositoryActivitySection";

const createActivity = (
  overrides: Partial<UsageRepositoryActivityResponse> = {},
): UsageRepositoryActivityResponse => ({
  range: "24h",
  rangeStart: "2026-07-10T00:00:00.000Z",
  rangeEnd: "2026-07-11T00:00:00.000Z",
  coverage: {
    status: "complete",
    trackingStartedAt: "2026-06-01T00:00:00.000Z",
    gapDurationMs: 0,
    unattributedRunningMs: 0,
    unattributedCompletedRunCount: 0,
    unverifiedCompletedRunCount: 0,
  },
  items: [
    {
      repoKey: "alpha",
      repoRoot: "/Users/test/alpha",
      repoName: "alpha",
      activeTimeMs: 60_000,
      agentTimeMs: 90_000,
      completedRunCount: 2,
      lastActiveAt: "2026-07-10T23:00:00.000Z",
    },
  ],
  fetchedAt: "2026-07-11T00:00:00.000Z",
  ...overrides,
});

const renderSection = (overrides: Partial<Parameters<typeof RepositoryActivitySection>[0]> = {}) =>
  render(
    <RepositoryActivitySection
      activity={createActivity()}
      loading={false}
      error={null}
      range="24h"
      onRangeChange={vi.fn()}
      {...overrides}
    />,
  );

describe("RepositoryActivitySection", () => {
  it("explains the metric and assigns competition ranks", () => {
    const activity = createActivity({
      items: [
        {
          repoKey: "alpha",
          repoRoot: "/repo/alpha",
          repoName: "alpha",
          activeTimeMs: 120_000,
          agentTimeMs: 120_000,
          completedRunCount: 1,
          lastActiveAt: "2026-07-10T23:00:00.000Z",
        },
        {
          repoKey: "beta",
          repoRoot: "/repo/beta",
          repoName: "beta",
          activeTimeMs: 120_000,
          agentTimeMs: 180_000,
          completedRunCount: 2,
          lastActiveAt: "2026-07-10T22:00:00.000Z",
        },
        {
          repoKey: "gamma",
          repoRoot: "/repo/gamma",
          repoName: "gamma",
          activeTimeMs: 60_000,
          agentTimeMs: 240_000,
          completedRunCount: 3,
          lastActiveAt: "2026-07-10T21:00:00.000Z",
        },
      ],
    });

    renderSection({ activity });

    expect(screen.getByRole("heading", { name: "Repository activity" })).toBeTruthy();
    expect(screen.getByText(/not token usage, cost, or productivity/i)).toBeTruthy();
    expect(screen.getByText("Bars are relative to the leading repository.")).toBeTruthy();

    const rows = screen.getAllByRole("listitem");
    expect(within(rows[0]!).getByText("alpha")).toBeTruthy();
    expect(within(rows[0]!).getByText("1")).toBeTruthy();
    expect(within(rows[1]!).getByText("beta")).toBeTruthy();
    expect(within(rows[1]!).getByText("1")).toBeTruthy();
    expect(within(rows[2]!).getByText("gamma")).toBeTruthy();
    expect(within(rows[2]!).getByText("3")).toBeTruthy();
  });

  it("sorts by the selected metric and expands beyond the top five", () => {
    const activity = createActivity({
      items: Array.from({ length: 6 }, (_, index) => ({
        repoKey: `repo-${index + 1}`,
        repoRoot: `/repo/repo-${index + 1}`,
        repoName: `repo-${index + 1}`,
        activeTimeMs: (6 - index) * 60_000,
        agentTimeMs: (index + 1) * 60_000,
        completedRunCount: index + 1,
        lastActiveAt: "2026-07-10T23:00:00.000Z",
      })),
    });

    renderSection({ activity });
    expect(screen.getAllByRole("listitem")).toHaveLength(5);

    fireEvent.click(screen.getByRole("button", { name: "Agent time" }));
    expect(within(screen.getAllByRole("listitem")[0]!).getByText("repo-6")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Show all 6" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(6);
    expect(screen.getByRole("button", { name: "Show top 5" })).toBeTruthy();
  });

  it("shows partial coverage and unattributed activity warnings", () => {
    renderSection({
      activity: createActivity({
        coverage: {
          status: "partial",
          trackingStartedAt: "2026-07-10T12:00:00.000Z",
          gapDurationMs: 30 * 60_000,
          unattributedRunningMs: 15 * 60_000,
          unattributedCompletedRunCount: 3,
          unverifiedCompletedRunCount: 2,
        },
      }),
    });

    expect(screen.getByText(/Partial history only/)).toBeTruthy();
    expect(screen.getByText(/30m not observed/)).toBeTruthy();
    expect(screen.getByText(/15m of agent activity could not be attributed/)).toBeTruthy();
    expect(screen.getByText(/3 explicit completions could not be attributed/)).toBeTruthy();
    expect(screen.getByText(/2 completed runs had no confirmed start event/)).toBeTruthy();
  });

  it("renders loading, empty, and error states", () => {
    const { rerender } = renderSection({ activity: null, loading: true });
    const loadingStatus = screen.getByRole("status", { name: "Loading repository activity" });
    const loadingContent = screen.getByTestId("repository-activity-content");
    expect(loadingContent.getAttribute("aria-busy")).toBe("true");
    expect(loadingContent.contains(loadingStatus)).toBe(false);
    expect(screen.getAllByTestId("repository-activity-skeleton-row")).toHaveLength(3);
    expect(screen.getAllByTestId("repository-activity-skeleton-row")[0]?.className).toContain(
      "min-h-[132px]",
    );

    rerender(
      <RepositoryActivitySection
        activity={createActivity({ items: [] })}
        loading={false}
        error={null}
        range="24h"
        onRangeChange={vi.fn()}
      />,
    );
    expect(screen.getByText("No repository activity in this range.")).toBeTruthy();

    rerender(
      <RepositoryActivitySection
        activity={null}
        loading={false}
        error="Failed to load repository activity"
        range="24h"
        onRangeChange={vi.fn()}
      />,
    );
    expect(screen.getByRole("alert").textContent).toContain("Failed to load repository activity");
  });

  it("keeps existing repository rows visible during a refresh", () => {
    renderSection({ activity: createActivity(), loading: true });

    expect(screen.getAllByRole("listitem").length).toBeGreaterThan(0);
    expect(screen.queryByRole("status", { name: "Loading repository activity" })).toBeNull();
    expect(screen.queryByTestId("repository-activity-skeleton-row")).toBeNull();
  });

  it("requests the selected range", () => {
    const onRangeChange = vi.fn();
    renderSection({ onRangeChange });

    fireEvent.click(screen.getByRole("button", { name: "7d" }));
    expect(onRangeChange).toHaveBeenCalledWith("7d");
  });
});
