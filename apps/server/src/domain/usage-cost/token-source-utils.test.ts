import { describe, expect, it } from "vitest";

import { toUsageDayKey, toUsageWindowBoundaries } from "./token-source-utils";

describe("usage day boundaries", () => {
  it("starts the usage day at 03:00 in the local time zone", () => {
    const beforeBoundary = new Date(2026, 6, 21, 2, 59, 59, 999);
    const atBoundary = new Date(2026, 6, 21, 3, 0, 0, 0);

    expect(toUsageWindowBoundaries(beforeBoundary).todayStartMs).toBe(
      new Date(2026, 6, 20, 3, 0, 0, 0).getTime(),
    );
    expect(toUsageWindowBoundaries(atBoundary).todayStartMs).toBe(atBoundary.getTime());
  });

  it("assigns timestamps before 03:00 to the previous local calendar day", () => {
    expect(toUsageDayKey(new Date(2026, 0, 1, 2, 59, 59, 999).getTime())).toBe("2025-12-31");
    expect(toUsageDayKey(new Date(2026, 0, 1, 3, 0, 0, 0).getTime())).toBe("2026-01-01");
  });

  it("starts the 30-day window at 03:00 29 local calendar days earlier", () => {
    const now = new Date(2026, 2, 20, 12, 0, 0, 0);

    expect(toUsageWindowBoundaries(now).last30daysStartMs).toBe(
      new Date(2026, 1, 19, 3, 0, 0, 0).getTime(),
    );
  });
});
