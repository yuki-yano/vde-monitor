import { describe, expect, it } from "vitest";

import { createSessionTimelineStore } from "./store.js";

const nowAt = (() => {
  let current = Date.parse("2026-02-06T00:00:00.000Z");
  return {
    now: () => new Date(current),
    set: (value: string) => {
      current = Date.parse(value);
    },
  };
})();

describe("createSessionTimelineStore", () => {
  it("records state transitions and merges duplicate consecutive states", () => {
    const clock = nowAt;
    clock.set("2026-02-06T00:00:00.000Z");
    const store = createSessionTimelineStore({ now: clock.now });

    store.record({
      paneId: "%1",
      state: "RUNNING",
      reason: "hook:PreToolUse",
      at: "2026-02-06T00:00:00.000Z",
      source: "hook",
    });
    store.record({
      paneId: "%1",
      state: "RUNNING",
      reason: "hook:PreToolUse",
      at: "2026-02-06T00:00:10.000Z",
      source: "hook",
    });
    store.record({
      paneId: "%1",
      state: "WAITING_INPUT",
      reason: "hook:stop",
      at: "2026-02-06T00:00:30.000Z",
      source: "hook",
    });

    clock.set("2026-02-06T00:00:40.000Z");
    const timeline = store.getTimeline({ paneId: "%1", range: "1h" });

    expect(timeline.items).toHaveLength(2);
    expect(timeline.items[0]?.state).toBe("WAITING_INPUT");
    expect(timeline.items[0]?.durationMs).toBe(10_000);
    expect(timeline.items[1]?.state).toBe("RUNNING");
    expect(timeline.items[1]?.durationMs).toBe(30_000);
    expect(timeline.totalsMs.RUNNING).toBe(30_000);
    expect(timeline.totalsMs.WAITING_INPUT).toBe(10_000);
  });

  it("closes an open state when pane is removed", () => {
    const clock = nowAt;
    clock.set("2026-02-06T01:00:00.000Z");
    const store = createSessionTimelineStore({ now: clock.now });

    store.record({
      paneId: "%2",
      state: "WAITING_PERMISSION",
      reason: "hook:permission_prompt",
      at: "2026-02-06T01:00:00.000Z",
      source: "hook",
    });

    clock.set("2026-02-06T01:00:15.000Z");
    store.closePane({ paneId: "%2" });
    clock.set("2026-02-06T01:00:30.000Z");

    const timeline = store.getTimeline({ paneId: "%2", range: "1h" });
    expect(timeline.current).toBeNull();
    expect(timeline.items[0]?.durationMs).toBe(15_000);
    expect(timeline.items[0]?.endedAt).toBe("2026-02-06T01:00:15.000Z");
  });

  it("applies range and limit constraints", () => {
    const clock = nowAt;
    clock.set("2026-02-06T02:00:00.000Z");
    const store = createSessionTimelineStore({ now: clock.now });

    store.record({
      paneId: "%3",
      state: "RUNNING",
      reason: "poll",
      at: "2026-02-06T01:30:00.000Z",
    });
    store.record({
      paneId: "%3",
      state: "WAITING_INPUT",
      reason: "hook:stop",
      at: "2026-02-06T01:45:00.000Z",
      source: "hook",
    });
    store.record({
      paneId: "%3",
      state: "RUNNING",
      reason: "hook:PreToolUse",
      at: "2026-02-06T01:50:00.000Z",
      source: "hook",
    });

    clock.set("2026-02-06T02:00:00.000Z");
    const timeline = store.getTimeline({ paneId: "%3", range: "15m", limit: 2 });

    expect(timeline.items).toHaveLength(2);
    expect(timeline.items[0]?.startedAt).toBe("2026-02-06T01:50:00.000Z");
    expect(timeline.items[1]?.startedAt).toBe("2026-02-06T01:45:00.000Z");
    expect(timeline.totalsMs.RUNNING).toBe(10 * 60 * 1000);
    expect(timeline.totalsMs.WAITING_INPUT).toBe(5 * 60 * 1000);
  });

  it("serializes and restores timeline events", () => {
    const clock = nowAt;
    clock.set("2026-02-06T03:00:00.000Z");
    const store = createSessionTimelineStore({ now: clock.now });

    store.record({
      paneId: "%4",
      state: "RUNNING",
      reason: "poll",
      at: "2026-02-06T01:00:00.000Z",
      source: "poll",
    });
    store.record({
      paneId: "%4",
      state: "WAITING_INPUT",
      reason: "hook:stop",
      at: "2026-02-06T02:00:00.000Z",
      source: "hook",
    });

    const persisted = store.serialize();

    const restoredStore = createSessionTimelineStore({ now: clock.now });
    restoredStore.restore(persisted);
    const timeline = restoredStore.getTimeline({ paneId: "%4", range: "6h" });

    expect(timeline.items).toHaveLength(2);
    expect(timeline.items[0]?.state).toBe("WAITING_INPUT");
    expect(timeline.items[0]?.endedAt).toBeNull();
    expect(timeline.items[0]?.durationMs).toBe(60 * 60 * 1000);
    expect(timeline.items[1]?.state).toBe("RUNNING");
    expect(timeline.items[1]?.durationMs).toBe(60 * 60 * 1000);
  });
});
