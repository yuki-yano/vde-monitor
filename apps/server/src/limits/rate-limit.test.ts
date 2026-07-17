import { describe, expect, it, vi } from "vitest";

import { createRateLimiter } from "./rate-limit";

describe("createRateLimiter", () => {
  it("enforces max per window and resets after window", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2025-01-01T00:00:00Z"));
      const limiter = createRateLimiter(1000, 2);

      expect(limiter("client")).toBe(true);
      expect(limiter("client")).toBe(true);
      expect(limiter("client")).toBe(false);

      vi.setSystemTime(new Date("2025-01-01T00:00:01.001Z"));
      expect(limiter("client")).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("sweeps expired entries instead of growing per unique key", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2025-01-01T00:00:00Z"));
      const limiter = createRateLimiter(1000, 2, { maxEntries: 3 });

      expect(limiter("a")).toBe(true);
      expect(limiter("b")).toBe(true);
      expect(limiter("c")).toBe(true);
      // The table is full and nothing has expired yet: new keys are refused.
      expect(limiter("d")).toBe(false);
      // Existing keys keep working while the table is full.
      expect(limiter("a")).toBe(true);

      // After the window passes, expired entries are swept and new keys fit.
      vi.setSystemTime(new Date("2025-01-01T00:00:01.001Z"));
      expect(limiter("d")).toBe(true);
      expect(limiter("e")).toBe(true);
      expect(limiter("f")).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
