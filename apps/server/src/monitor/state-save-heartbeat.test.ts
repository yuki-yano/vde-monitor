import { describe, expect, it } from "vitest";

import { createStateSaveHeartbeat } from "./state-save-heartbeat";

describe("createStateSaveHeartbeat", () => {
  it("is not due before anything has been written", () => {
    let nowMs = 0;
    const heartbeat = createStateSaveHeartbeat({ intervalMs: 60_000, now: () => nowMs });

    nowMs = 120_000;
    expect(heartbeat.isDue()).toBe(false);
  });

  it("resets when a write is recorded", () => {
    let nowMs = 0;
    const heartbeat = createStateSaveHeartbeat({ intervalMs: 60_000, now: () => nowMs });

    heartbeat.markWritten();
    nowMs = 90_000;
    expect(heartbeat.isDue()).toBe(true);
    heartbeat.markWritten();
    nowMs = 149_999;
    expect(heartbeat.isDue()).toBe(false);
    nowMs = 150_000;
    expect(heartbeat.isDue()).toBe(true);
  });
});
