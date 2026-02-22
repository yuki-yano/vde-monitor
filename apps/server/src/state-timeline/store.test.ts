import { describe, expect, it } from "vitest";

import { createSessionTimelineStore } from "./store";

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

  it("retains enough history for 24h range by default", () => {
    const clock = nowAt;
    clock.set("2026-02-06T21:00:00.000Z");
    const store = createSessionTimelineStore({ now: clock.now });

    store.record({
      paneId: "%24h",
      state: "WAITING_INPUT",
      reason: "hook:stop",
      at: "2026-02-05T22:00:00.000Z",
      source: "hook",
    });
    store.record({
      paneId: "%24h",
      state: "RUNNING",
      reason: "hook:PreToolUse",
      at: "2026-02-06T08:00:00.000Z",
      source: "hook",
    });

    const timeline = store.getTimeline({ paneId: "%24h", range: "24h" });

    expect(timeline.items).toHaveLength(2);
    expect(timeline.items[0]?.state).toBe("RUNNING");
    expect(timeline.items[0]?.durationMs).toBe(13 * 60 * 60 * 1000);
    expect(timeline.items[1]?.state).toBe("WAITING_INPUT");
    expect(timeline.items[1]?.durationMs).toBe(10 * 60 * 60 * 1000);
    expect(timeline.totalsMs.RUNNING).toBe(13 * 60 * 60 * 1000);
    expect(timeline.totalsMs.WAITING_INPUT).toBe(10 * 60 * 60 * 1000);
  });

  it("retains enough history for 7d range by default", () => {
    const clock = nowAt;
    clock.set("2026-02-13T12:00:00.000Z");
    const store = createSessionTimelineStore({ now: clock.now });

    store.record({
      paneId: "%7d",
      state: "WAITING_INPUT",
      reason: "hook:stop",
      at: "2026-02-07T12:00:00.000Z",
      source: "hook",
    });
    store.record({
      paneId: "%7d",
      state: "RUNNING",
      reason: "hook:PreToolUse",
      at: "2026-02-12T00:00:00.000Z",
      source: "hook",
    });

    const timeline = store.getTimeline({ paneId: "%7d", range: "7d" });

    expect(timeline.items).toHaveLength(2);
    expect(timeline.items[0]?.state).toBe("RUNNING");
    expect(timeline.items[1]?.state).toBe("WAITING_INPUT");
  });

  it("uses range-aware default limit for pane timeline", () => {
    const clock = nowAt;
    clock.set("2026-02-06T03:00:00.000Z");
    const store = createSessionTimelineStore({ now: clock.now });

    const startMs = Date.parse("2026-02-06T00:00:00.000Z");
    for (let index = 0; index < 250; index += 1) {
      store.record({
        paneId: "%pane-range-default",
        state: index % 2 === 0 ? "RUNNING" : "WAITING_INPUT",
        reason: `event:${index}`,
        at: new Date(startMs + index * 30_000).toISOString(),
        source: "hook",
      });
    }

    const timeline = store.getTimeline({ paneId: "%pane-range-default", range: "3h" });

    expect(timeline.items).toHaveLength(250);
    expect(timeline.items[0]?.reason).toBe("event:249");
    expect(timeline.items[249]?.reason).toBe("event:0");
  });

  it("aggregates repo timeline across panes with state priority", () => {
    const clock = nowAt;
    clock.set("2026-02-06T00:00:00.000Z");
    const store = createSessionTimelineStore({ now: clock.now });

    store.record({
      paneId: "%a",
      state: "WAITING_INPUT",
      reason: "hook:stop",
      at: "2026-02-06T00:00:00.000Z",
      source: "hook",
    });
    store.record({
      paneId: "%a",
      state: "RUNNING",
      reason: "hook:PreToolUse",
      at: "2026-02-06T00:20:00.000Z",
      source: "hook",
    });

    store.record({
      paneId: "%b",
      state: "WAITING_PERMISSION",
      reason: "hook:permission_prompt",
      at: "2026-02-06T00:10:00.000Z",
      source: "hook",
    });
    store.record({
      paneId: "%b",
      state: "WAITING_INPUT",
      reason: "hook:stop",
      at: "2026-02-06T00:25:00.000Z",
      source: "hook",
    });

    clock.set("2026-02-06T00:30:00.000Z");
    const timeline = store.getRepoTimeline({
      paneId: "%a",
      paneIds: ["%a", "%b"],
      range: "1h",
      limit: 10,
    });

    expect(timeline.items).toHaveLength(3);
    expect(timeline.items[0]?.state).toBe("RUNNING");
    expect(timeline.items[0]?.durationMs).toBe(5 * 60 * 1000);
    expect(timeline.items[0]?.endedAt).toBeNull();
    expect(timeline.items[1]?.state).toBe("WAITING_PERMISSION");
    expect(timeline.items[1]?.durationMs).toBe(15 * 60 * 1000);
    expect(timeline.items[2]?.state).toBe("WAITING_INPUT");
    expect(timeline.items[2]?.durationMs).toBe(10 * 60 * 1000);
    expect(timeline.totalsMs.RUNNING).toBe(5 * 60 * 1000);
    expect(timeline.totalsMs.WAITING_PERMISSION).toBe(15 * 60 * 1000);
    expect(timeline.totalsMs.WAITING_INPUT).toBe(10 * 60 * 1000);
  });

  it("supports custom aggregate reason and id prefix", () => {
    const clock = nowAt;
    clock.set("2026-02-06T00:30:00.000Z");
    const store = createSessionTimelineStore({ now: clock.now });

    store.record({
      paneId: "%global-a",
      state: "RUNNING",
      reason: "hook:PreToolUse",
      at: "2026-02-06T00:00:00.000Z",
      source: "hook",
    });

    const timeline = store.getRepoTimeline({
      paneId: "global",
      paneIds: ["%global-a"],
      range: "1h",
      aggregateReason: "global:aggregate",
      itemIdPrefix: "global",
    });

    expect(timeline.items[0]?.id.startsWith("global:global")).toBe(true);
    expect(timeline.items[0]?.reason).toBe("global:aggregate");
  });

  it("uses range-aware default limit for repo timeline", () => {
    const clock = nowAt;
    clock.set("2026-02-06T10:00:00.000Z");
    const store = createSessionTimelineStore({ now: clock.now });

    const startMs = Date.parse("2026-02-06T07:00:00.000Z");
    for (let index = 0; index < 260; index += 1) {
      store.record({
        paneId: "%repo-a",
        state: index % 2 === 0 ? "RUNNING" : "WAITING_INPUT",
        reason: `repo-event:${index}`,
        at: new Date(startMs + index * 20_000).toISOString(),
        source: "hook",
      });
    }

    const timeline = store.getRepoTimeline({
      paneId: "%repo-a",
      paneIds: ["%repo-a"],
      range: "3h",
    });

    expect(timeline.items).toHaveLength(260);
    expect(timeline.items[0]?.reason).toBe("repo:aggregate");
    expect(timeline.items[259]?.reason).toBe("repo:aggregate");
  });

  it("returns empty repo timeline when no pane ids are provided", () => {
    const clock = nowAt;
    clock.set("2026-02-06T02:00:00.000Z");
    const store = createSessionTimelineStore({ now: clock.now });

    const timeline = store.getRepoTimeline({
      paneId: "%missing",
      paneIds: [],
      range: "1h",
      limit: 10,
    });

    expect(timeline.items).toHaveLength(0);
    expect(timeline.current).toBeNull();
    expect(timeline.totalsMs.RUNNING).toBe(0);
    expect(timeline.totalsMs.WAITING_INPUT).toBe(0);
    expect(timeline.totalsMs.WAITING_PERMISSION).toBe(0);
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
