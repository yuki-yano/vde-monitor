import { describe, expect, it } from "vitest";

import { formatDurationMs } from "./time-format";

describe("formatDurationMs", () => {
  it("keeps minute precision across the 24-hour boundary", () => {
    expect(formatDurationMs(24 * 60 * 60 * 1000 - 1)).toBe("23h 59m");
    expect(formatDurationMs(24 * 60 * 60 * 1000)).toBe("1d");
    expect(formatDurationMs((24 * 60 + 1) * 60 * 1000)).toBe("1d 1m");
    expect(formatDurationMs((25 * 60 + 30) * 60 * 1000)).toBe("1d 1h 30m");
  });
});
