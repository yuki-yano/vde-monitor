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

  it("lists repo roots observed in the selected range", () => {
    const clock = nowAt;
    clock.set("2026-02-06T03:00:00.000Z");
    const store = createSessionTimelineStore({ now: clock.now });

    store.record({
      paneId: "%repo-a",
      state: "RUNNING",
      reason: "hook:PreToolUse",
      repoRoot: "/repo/a",
      at: "2026-02-06T02:30:00.000Z",
      source: "hook",
    });
    store.record({
      paneId: "%repo-b",
      state: "WAITING_INPUT",
      reason: "hook:stop",
      repoRoot: "/repo/b",
      at: "2026-02-06T02:40:00.000Z",
      source: "hook",
    });
    store.record({
      paneId: "%repo-null",
      state: "RUNNING",
      reason: "hook:PreToolUse",
      at: "2026-02-06T02:50:00.000Z",
      source: "hook",
    });
    store.record({
      paneId: "%repo-old",
      state: "RUNNING",
      reason: "hook:PreToolUse",
      repoRoot: "/repo/old",
      at: "2026-02-06T00:30:00.000Z",
      source: "hook",
    });
    store.record({
      paneId: "%repo-old",
      state: "WAITING_INPUT",
      reason: "hook:stop",
      at: "2026-02-06T00:40:00.000Z",
      source: "hook",
    });

    const roots = store.listRepoRoots({ range: "1h" });
    expect(roots).toEqual(["/repo/a", "/repo/b"]);
  });

  it("calculates repo activity metrics with sum/union/transitions", () => {
    const clock = nowAt;
    clock.set("2026-02-06T02:00:00.000Z");
    const store = createSessionTimelineStore({ now: clock.now });

    store.record({
      paneId: "%a",
      state: "RUNNING",
      reason: "hook:PreToolUse",
      repoRoot: "/repo/x",
      at: "2026-02-06T01:30:00.000Z",
      source: "hook",
    });
    store.record({
      paneId: "%a",
      state: "WAITING_INPUT",
      reason: "hook:stop",
      repoRoot: "/repo/x",
      at: "2026-02-06T01:50:00.000Z",
      source: "hook",
    });
    store.record({
      paneId: "%b",
      state: "RUNNING",
      reason: "hook:PreToolUse",
      repoRoot: "/repo/x",
      at: "2026-02-06T01:40:00.000Z",
      source: "hook",
    });

    const metrics = store.getRepoActivityMetrics({ repoRoot: "/repo/x", range: "1h" });
    expect(metrics.runningMs).toBe(40 * 60 * 1000);
    expect(metrics.runningUnionMs).toBe(30 * 60 * 1000);
    expect(metrics.executionCount).toBe(2);
    expect(metrics.totalPaneCount).toBe(2);
    expect(metrics.activePaneCount).toBe(2);
    expect(metrics.approximate).toBe(false);
    expect(metrics.approximationReason).toBeNull();
  });

  it("does not count RUNNING transitions that started before range", () => {
    const clock = nowAt;
    clock.set("2026-02-06T02:00:00.000Z");
    const store = createSessionTimelineStore({ now: clock.now });

    store.record({
      paneId: "%c",
      state: "RUNNING",
      reason: "hook:PreToolUse",
      repoRoot: "/repo/x",
      at: "2026-02-06T00:50:00.000Z",
      source: "hook",
    });
    store.record({
      paneId: "%c",
      state: "WAITING_INPUT",
      reason: "hook:stop",
      repoRoot: "/repo/x",
      at: "2026-02-06T01:20:00.000Z",
      source: "hook",
    });

    const metrics = store.getRepoActivityMetrics({ repoRoot: "/repo/x", range: "1h" });
    expect(metrics.runningMs).toBe(20 * 60 * 1000);
    expect(metrics.executionCount).toBe(0);
  });

  it("marks metrics as approximate when range is outside retention floor", () => {
    const clock = nowAt;
    clock.set("2026-02-06T02:00:00.000Z");
    const store = createSessionTimelineStore({ now: clock.now, retentionMs: 30 * 60 * 1000 });

    store.record({
      paneId: "%d",
      state: "RUNNING",
      reason: "hook:PreToolUse",
      repoRoot: "/repo/x",
      at: "2026-02-06T01:45:00.000Z",
      source: "hook",
    });

    const metrics = store.getRepoActivityMetrics({ repoRoot: "/repo/x", range: "1h" });
    expect(metrics.approximate).toBe(true);
    expect(metrics.approximationReason).toBe("retention_clipped");
  });

  it("splits same-state events when repoRoot changes", () => {
    const clock = nowAt;
    clock.set("2026-02-06T02:00:00.000Z");
    const store = createSessionTimelineStore({ now: clock.now });

    store.record({
      paneId: "%switch",
      state: "RUNNING",
      reason: "hook:PreToolUse",
      repoRoot: "/repo/a",
      at: "2026-02-06T01:30:00.000Z",
      source: "hook",
    });
    store.record({
      paneId: "%switch",
      state: "RUNNING",
      reason: "hook:PreToolUse",
      repoRoot: "/repo/b",
      at: "2026-02-06T01:40:00.000Z",
      source: "hook",
    });

    const timeline = store.getTimeline({ paneId: "%switch", range: "1h" });
    expect(timeline.items).toHaveLength(2);
    expect(timeline.items[0]?.durationMs).toBe(20 * 60 * 1000);
    expect(timeline.items[1]?.durationMs).toBe(10 * 60 * 1000);

    const repoA = store.getRepoActivityMetrics({ repoRoot: "/repo/a", range: "1h" });
    const repoB = store.getRepoActivityMetrics({ repoRoot: "/repo/b", range: "1h" });
    expect(repoA.runningMs).toBe(10 * 60 * 1000);
    expect(repoA.executionCount).toBe(1);
    expect(repoB.runningMs).toBe(20 * 60 * 1000);
    expect(repoB.executionCount).toBe(1);
  });

  it("prunes events only by retention window", () => {
    const clock = nowAt;
    clock.set("2026-02-06T01:00:00.000Z");
    const store = createSessionTimelineStore({ now: clock.now, retentionMs: 10 * 60 * 1000 });

    store.record({
      paneId: "%retention",
      state: "RUNNING",
      reason: "old-running",
      at: "2026-02-06T00:40:00.000Z",
      source: "poll",
    });
    store.record({
      paneId: "%retention",
      state: "WAITING_INPUT",
      reason: "waiting",
      at: "2026-02-06T00:45:00.000Z",
      source: "poll",
    });
    store.record({
      paneId: "%retention",
      state: "RUNNING",
      reason: "new-running",
      at: "2026-02-06T00:55:00.000Z",
      source: "poll",
    });

    const timeline = store.getTimeline({ paneId: "%retention", range: "1h" });
    expect(timeline.items).toHaveLength(2);
    expect(timeline.items[0]?.reason).toBe("new-running");
    expect(timeline.items[1]?.reason).toBe("waiting");
  });
});
