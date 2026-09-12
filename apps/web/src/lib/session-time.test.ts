import { describe, expect, it } from "vitest";

import { compareTimeDesc, parseTime, pickLatestInputAt } from "./session-time";

describe("parseTime", () => {
  it("returns null for invalid values", () => {
    expect(parseTime(null)).toBeNull();
    expect(parseTime("")).toBeNull();
    expect(parseTime("invalid")).toBeNull();
  });
});

describe("compareTimeDesc", () => {
  it("sorts newer timestamps first", () => {
    expect(compareTimeDesc("2026-02-17T12:00:00.000Z", "2026-02-17T10:00:00.000Z")).toBeLessThan(0);
    expect(compareTimeDesc("2026-02-17T10:00:00.000Z", "2026-02-17T12:00:00.000Z")).toBeGreaterThan(
      0,
    );
  });

  it("treats invalid and null as equal when both are not comparable", () => {
    expect(compareTimeDesc(null, null)).toBe(0);
    expect(compareTimeDesc("invalid", null)).toBe(0);
  });
});

describe("pickLatestInputAt", () => {
  it("returns the latest valid lastInputAt value", () => {
    const latest = pickLatestInputAt([
      { lastInputAt: null },
      { lastInputAt: "2026-02-17T12:00:00.000Z" },
      { lastInputAt: "2026-02-17T10:00:00.000Z" },
    ]);

    expect(latest).toBe("2026-02-17T12:00:00.000Z");
  });

  it("returns null when no valid values exist", () => {
    const latest = pickLatestInputAt([{ lastInputAt: null }, { lastInputAt: "invalid" }]);
    expect(latest).toBeNull();
  });
});
