import { describe, expect, it } from "vitest";

import { prunePaneRecord } from "./pane-record-utils";

describe("prunePaneRecord", () => {
  it("returns same reference when no stale keys exist", () => {
    const record = { "%1": 1 };
    const next = prunePaneRecord(record, new Set(["%1"]));
    expect(next).toBe(record);
  });

  it("returns a pruned record when stale keys exist", () => {
    const next = prunePaneRecord(
      {
        "%1": 1,
        "%2": 2,
      },
      new Set(["%2"]),
    );
    expect(next).toEqual({ "%2": 2 });
  });
});
