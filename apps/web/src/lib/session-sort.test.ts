import { describe, expect, it } from "vitest";

import { compareSessionSortDesc, resolveSessionSortAt } from "./session-sort";

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
  it("uses the latest run, input, or manual sort timestamp", () => {
    expect(
      resolveSessionSortAt(
        buildSortFields({
          lastInputAt: "2026-07-14T01:00:00.000Z",
          lastRunStartedAt: "2026-07-14T02:00:00.000Z",
          manualSortAt: "2026-07-14T03:00:00.000Z",
        }),
      ),
    ).toBe(Date.parse("2026-07-14T03:00:00.000Z"));
  });

  it("sorts a newer run above a pane with newer input", () => {
    const newerRun = buildSortFields({ lastRunStartedAt: "2026-07-14T03:00:00.000Z" });
    const newerInput = buildSortFields({ lastInputAt: "2026-07-14T02:00:00.000Z" });

    expect(compareSessionSortDesc(newerRun, newerInput)).toBeLessThan(0);
  });

  it("ignores invalid timestamps", () => {
    expect(resolveSessionSortAt(buildSortFields({ lastRunStartedAt: "invalid" }))).toBe(
      Number.NEGATIVE_INFINITY,
    );
  });
});
