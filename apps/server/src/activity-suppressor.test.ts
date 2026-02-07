import { describe, expect, it, vi } from "vitest";

import { markPaneFocus, shouldSuppressActivity } from "./activity-suppressor";

describe("activity suppressor", () => {
  it("suppresses window activity right after focus", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-01T00:00:00Z"));

    markPaneFocus("%1");
    const activityIso = new Date("2025-01-01T00:00:01Z").toISOString();
    expect(shouldSuppressActivity("%1", activityIso)).toBe(true);

    vi.useRealTimers();
  });

  it("does not suppress when activity is later", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-01T00:00:00Z"));

    markPaneFocus("%2");
    vi.setSystemTime(new Date("2025-01-01T00:00:05Z"));
    const activityIso = new Date("2025-01-01T00:00:05Z").toISOString();
    expect(shouldSuppressActivity("%2", activityIso)).toBe(false);

    vi.useRealTimers();
  });

  it("does not suppress when activity is before focus", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-01T00:00:10Z"));

    markPaneFocus("%3");
    const activityIso = new Date("2025-01-01T00:00:08Z").toISOString();
    expect(shouldSuppressActivity("%3", activityIso)).toBe(false);

    vi.useRealTimers();
  });
});
