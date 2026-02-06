// @vitest-environment happy-dom
import { act, renderHook, waitFor } from "@testing-library/react";
import type { SessionStateTimeline, SessionStateTimelineRange } from "@vde-monitor/shared";
import { describe, expect, it, vi } from "vitest";

import { useSessionTimeline } from "./useSessionTimeline";

const buildTimeline = (range: SessionStateTimelineRange): SessionStateTimeline => ({
  paneId: "pane-1",
  now: new Date(0).toISOString(),
  range,
  items: [],
  totalsMs: {
    RUNNING: 0,
    WAITING_INPUT: 0,
    WAITING_PERMISSION: 0,
    SHELL: 0,
    UNKNOWN: 0,
  },
  current: null,
});

describe("useSessionTimeline", () => {
  it("loads timeline on mount", async () => {
    const requestStateTimeline = vi.fn().mockResolvedValue(buildTimeline("1h"));

    renderHook(() =>
      useSessionTimeline({
        paneId: "pane-1",
        connected: true,
        requestStateTimeline,
        mobileDefaultCollapsed: false,
      }),
    );

    await waitFor(() => {
      expect(requestStateTimeline).toHaveBeenCalledWith("pane-1", { range: "1h", limit: 200 });
    });
  });

  it("refetches when range changes", async () => {
    const requestStateTimeline = vi
      .fn()
      .mockResolvedValueOnce(buildTimeline("1h"))
      .mockResolvedValueOnce(buildTimeline("15m"));

    const { result } = renderHook(() =>
      useSessionTimeline({
        paneId: "pane-1",
        connected: true,
        requestStateTimeline,
        mobileDefaultCollapsed: false,
      }),
    );

    await waitFor(() => {
      expect(requestStateTimeline).toHaveBeenCalledWith("pane-1", { range: "1h", limit: 200 });
    });

    act(() => {
      result.current.setTimelineRange("15m");
    });

    await waitFor(() => {
      expect(requestStateTimeline).toHaveBeenLastCalledWith("pane-1", {
        range: "15m",
        limit: 200,
      });
    });
  });

  it("starts collapsed on mobile and toggles expanded state", async () => {
    const requestStateTimeline = vi.fn().mockResolvedValue(buildTimeline("1h"));

    const { result } = renderHook(() =>
      useSessionTimeline({
        paneId: "pane-1",
        connected: true,
        requestStateTimeline,
        mobileDefaultCollapsed: true,
      }),
    );

    await waitFor(() => {
      expect(result.current.timelineExpanded).toBe(false);
    });

    act(() => {
      result.current.toggleTimelineExpanded();
    });
    expect(result.current.timelineExpanded).toBe(true);
  });
});
