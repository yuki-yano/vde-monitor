import { describe, expect, it } from "vitest";

import { resolveSessionSortAt } from "./session-sort";

const buildSortFields = (
  overrides: Partial<{
    lastInputAt: string | null;
    lastRunStartedAt: string | null;
    manualSortAt: string | null;
  }> = {},
) => ({
  lastInputAt: null,
  lastRunStartedAt: null,
  manualSortAt: null,
  ...overrides,
});

describe("session sort", () => {
  it("ignores invalid timestamps", () => {
    expect(resolveSessionSortAt(buildSortFields({ lastRunStartedAt: "invalid" }))).toBe(
      Number.NEGATIVE_INFINITY,
    );
  });
});
