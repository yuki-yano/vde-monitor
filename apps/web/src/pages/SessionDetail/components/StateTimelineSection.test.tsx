// @vitest-environment happy-dom
import { fireEvent, render, screen } from "@testing-library/react";
import type { SessionStateTimeline } from "@vde-monitor/shared";
import { describe, expect, it, vi } from "vitest";

import { StateTimelineSection } from "./StateTimelineSection";

const timeline: SessionStateTimeline = {
  paneId: "pane-1",
  now: "2026-02-06T21:00:00.000Z",
  range: "1h",
  items: [
    {
      id: "latest",
      paneId: "pane-1",
      state: "WAITING_INPUT",
      reason: "inactive_timeout",
      startedAt: "2026-02-06T20:20:00.000Z",
      endedAt: null,
      durationMs: 40 * 60 * 1000,
      source: "poll",
    },
    {
      id: "previous",
      paneId: "pane-1",
      state: "RUNNING",
      reason: "recent_output",
      startedAt: "2026-02-06T20:00:00.000Z",
      endedAt: "2026-02-06T20:20:00.000Z",
      durationMs: 20 * 60 * 1000,
      source: "poll",
    },
  ],
  totalsMs: {
    RUNNING: 20 * 60 * 1000,
    WAITING_INPUT: 40 * 60 * 1000,
    WAITING_PERMISSION: 0,
    SHELL: 0,
    UNKNOWN: 0,
  },
  current: {
    id: "latest",
    paneId: "pane-1",
    state: "WAITING_INPUT",
    reason: "inactive_timeout",
    startedAt: "2026-02-06T20:20:00.000Z",
    endedAt: null,
    durationMs: 40 * 60 * 1000,
    source: "poll",
  },
};

const buildProps = (overrides?: { timelineExpanded?: boolean; isMobile?: boolean }) => ({
  state: {
    timeline,
    timelineRange: "1h" as const,
    timelineError: null,
    timelineLoading: false,
    timelineExpanded: overrides?.timelineExpanded ?? false,
    isMobile: overrides?.isMobile ?? false,
  },
  actions: {
    onTimelineRangeChange: vi.fn(),
    onTimelineRefresh: vi.fn(),
    onToggleTimelineExpanded: vi.fn(),
  },
});

describe("StateTimelineSection", () => {
  it("uses compact mode as default and highlights compact button", () => {
    const props = buildProps({ timelineExpanded: false, isMobile: false });
    const { container } = render(<StateTimelineSection {...props} />);

    const compactButton = screen.getByLabelText("Toggle compact timeline");
    expect(compactButton.className).toContain("border-latte-lavender/85");
    expect(compactButton.className).toContain("bg-latte-lavender/22");
    expect(compactButton.textContent).toBe("Compact");
    expect(container.textContent ?? "").not.toContain("Current ");
    expect(screen.queryByText("Compact view")).toBeNull();
    expect(screen.queryByText("Raw view")).toBeNull();
  });

  it("shows only one history row when collapsed", () => {
    const props = buildProps({ timelineExpanded: false, isMobile: false });
    render(<StateTimelineSection {...props} />);

    expect(screen.getByText("inactive_timeout")).toBeTruthy();
    expect(screen.queryByText("recent_output")).toBeNull();
    expect(screen.getByLabelText("Expand timeline")).toBeTruthy();
  });

  it("shows all history rows when expanded", () => {
    const props = buildProps({ timelineExpanded: true, isMobile: true });
    render(<StateTimelineSection {...props} />);

    expect(screen.getByText("inactive_timeout")).toBeTruthy();
    expect(screen.getByText("recent_output")).toBeTruthy();
    expect(screen.getByLabelText("Collapse timeline")).toBeTruthy();
  });

  it("uses shared toggle action on desktop", () => {
    const props = buildProps({ timelineExpanded: false, isMobile: false });
    render(<StateTimelineSection {...props} />);

    fireEvent.click(screen.getByLabelText("Expand timeline"));
    expect(props.actions.onToggleTimelineExpanded).toHaveBeenCalledTimes(1);
  });

  it("turns off compact highlight when toggled off", () => {
    const props = buildProps({ timelineExpanded: false, isMobile: false });
    render(<StateTimelineSection {...props} />);

    const compactButton = screen.getByLabelText("Toggle compact timeline");
    fireEvent.click(compactButton);
    expect(compactButton.className).toContain("border-latte-surface2/70");
    expect(compactButton.className).toContain("bg-latte-base/75");
  });
});
