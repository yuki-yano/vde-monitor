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

  it("records DONE separately as non-running completion wait time", () => {
    const clock = nowAt;
    clock.set("2026-02-06T00:00:00.000Z");
    const store = createSessionTimelineStore({ now: clock.now });

    store.record({
      paneId: "%done",
      state: "DONE",
      reason: "completion:pending",
      at: "2026-02-06T00:00:00.000Z",
      source: "hook",
    });
    clock.set("2026-02-06T00:00:10.000Z");

    const timeline = store.getTimeline({ paneId: "%done", range: "1h" });

    expect(timeline.items[0]?.state).toBe("DONE");
    expect(timeline.totalsMs.DONE).toBe(10_000);
    expect(timeline.totalsMs.RUNNING).toBe(0);
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

  it("retains enough history for 30d range by default", () => {
    const clock = nowAt;
    clock.set("2026-03-05T12:00:00.000Z");
    const store = createSessionTimelineStore({ now: clock.now });

    store.record({
      paneId: "%30d",
      state: "WAITING_INPUT",
      reason: "hook:stop",
      at: "2026-02-10T12:00:00.000Z",
      source: "hook",
    });
    store.record({
      paneId: "%30d",
      state: "RUNNING",
      reason: "hook:PreToolUse",
      at: "2026-03-01T00:00:00.000Z",
      source: "hook",
    });

    const timeline = store.getTimeline({ paneId: "%30d", range: "30d" });

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

  it("uses permission, running, DONE, waiting, shell, unknown state priority", () => {
    const clock = nowAt;
    clock.set("2026-02-06T00:15:00.000Z");
    const store = createSessionTimelineStore({ now: clock.now });

    store.record({
      paneId: "%done-priority",
      state: "DONE",
      reason: "completion:pending",
      at: "2026-02-06T00:00:00.000Z",
      source: "hook",
    });
    store.record({
      paneId: "%running-priority",
      state: "RUNNING",
      reason: "running",
      at: "2026-02-06T00:05:00.000Z",
      source: "poll",
    });
    store.record({
      paneId: "%permission-priority",
      state: "WAITING_PERMISSION",
      reason: "permission",
      at: "2026-02-06T00:10:00.000Z",
      source: "hook",
    });

    const timeline = store.getRepoTimeline({
      paneId: "repo-priority",
      paneIds: ["%done-priority", "%running-priority", "%permission-priority"],
      range: "1h",
    });

    expect(timeline.items.map(({ state }) => state)).toEqual([
      "WAITING_PERMISSION",
      "RUNNING",
      "DONE",
    ]);
  });

  it("uses hook, view, restore, poll source priority", () => {
    const clock = nowAt;
    clock.set("2026-02-06T00:10:00.000Z");
    const store = createSessionTimelineStore({ now: clock.now });

    const recordDone = (paneId: string, source: "hook" | "view" | "restore" | "poll") => {
      store.record({
        paneId,
        state: "DONE",
        reason: source,
        at: "2026-02-06T00:00:00.000Z",
        source,
      });
    };
    recordDone("%poll-source", "poll");
    recordDone("%restore-source", "restore");

    const restoreOverPoll = store.getRepoTimeline({
      paneId: "repo-source",
      paneIds: ["%poll-source", "%restore-source"],
      range: "1h",
    });
    expect(restoreOverPoll.items[0]?.source).toBe("restore");

    recordDone("%view-source", "view");
    const viewOverRestore = store.getRepoTimeline({
      paneId: "repo-source",
      paneIds: ["%poll-source", "%restore-source", "%view-source"],
      range: "1h",
    });
    expect(viewOverRestore.items[0]?.source).toBe("view");

    recordDone("%hook-source", "hook");
    const withHook = store.getRepoTimeline({
      paneId: "repo-source",
      paneIds: ["%poll-source", "%restore-source", "%view-source", "%hook-source"],
      range: "1h",
    });
    expect(withHook.items[0]?.source).toBe("hook");
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
      state: "DONE",
      reason: "completion:pending",
      at: "2026-02-06T02:00:00.000Z",
      source: "view",
    });

    const persisted = store.serialize();

    const restoredStore = createSessionTimelineStore({ now: clock.now });
    restoredStore.restore(persisted);
    const timeline = restoredStore.getTimeline({ paneId: "%4", range: "6h" });

    expect(timeline.items).toHaveLength(2);
    expect(timeline.items[0]?.state).toBe("DONE");
    expect(timeline.items[0]?.source).toBe("view");
    expect(timeline.items[0]?.endedAt).toBeNull();
    expect(timeline.items[0]?.durationMs).toBe(60 * 60 * 1000);
    expect(timeline.items[1]?.state).toBe("RUNNING");
    expect(timeline.items[1]?.durationMs).toBe(60 * 60 * 1000);
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
  });

  it("clamps an out-of-order record onto the open event's start boundary", () => {
    const clock = nowAt;
    clock.set("2026-02-06T04:00:00.000Z");
    const store = createSessionTimelineStore({ now: clock.now });

    store.record({
      paneId: "%out-of-order",
      state: "RUNNING",
      reason: "hook:PreToolUse",
      at: "2026-02-06T04:00:30.000Z",
      source: "hook",
    });
    // Arrives with an earlier `at` than the still-open previous event's start.
    store.record({
      paneId: "%out-of-order",
      state: "WAITING_INPUT",
      reason: "hook:stop",
      at: "2026-02-06T04:00:10.000Z",
      source: "hook",
    });

    // Raw storage: the previous open event is closed at its own start
    // (closeAtMs clamps up to lastStartMs), collapsing it to zero duration,
    // and the new event's start is clamped up to that same boundary.
    const persisted = store.serialize();
    expect(persisted["%out-of-order"]).toEqual([
      expect.objectContaining({
        state: "RUNNING",
        startedAt: "2026-02-06T04:00:30.000Z",
        endedAt: "2026-02-06T04:00:30.000Z",
      }),
      expect.objectContaining({
        state: "WAITING_INPUT",
        startedAt: "2026-02-06T04:00:30.000Z",
        endedAt: null,
      }),
    ]);

    clock.set("2026-02-06T04:01:00.000Z");
    const timeline = store.getTimeline({ paneId: "%out-of-order", range: "1h" });

    // The zero-duration RUNNING event has no observable interval, so it does
    // not surface in the queried timeline at all.
    expect(timeline.items).toHaveLength(1);
    expect(timeline.items[0]?.state).toBe("WAITING_INPUT");
    expect(timeline.items[0]?.startedAt).toBe("2026-02-06T04:00:30.000Z");
    expect(timeline.items[0]?.endedAt).toBeNull();
  });

  it("clamps an out-of-order record onto a previously closed event's end boundary", () => {
    const clock = nowAt;
    clock.set("2026-02-06T05:00:00.000Z");
    const store = createSessionTimelineStore({ now: clock.now });

    store.record({
      paneId: "%out-of-order-closed",
      state: "RUNNING",
      reason: "hook:PreToolUse",
      at: "2026-02-06T05:00:00.000Z",
      source: "hook",
    });
    store.record({
      paneId: "%out-of-order-closed",
      state: "WAITING_INPUT",
      reason: "hook:stop",
      at: "2026-02-06T05:00:20.000Z",
      source: "hook",
    });
    // Arrives with an `at` earlier than the previous (still open) event's
    // start, so it clamps onto that event's start boundary (05:00:20), not
    // its own requested time (05:00:10).
    store.record({
      paneId: "%out-of-order-closed",
      state: "RUNNING",
      reason: "hook:PreToolUse",
      at: "2026-02-06T05:00:10.000Z",
      source: "hook",
    });

    const persisted = store.serialize();
    expect(persisted["%out-of-order-closed"]).toEqual([
      expect.objectContaining({
        state: "RUNNING",
        startedAt: "2026-02-06T05:00:00.000Z",
        endedAt: "2026-02-06T05:00:20.000Z",
      }),
      expect.objectContaining({
        state: "WAITING_INPUT",
        startedAt: "2026-02-06T05:00:20.000Z",
        endedAt: "2026-02-06T05:00:20.000Z",
      }),
      expect.objectContaining({
        state: "RUNNING",
        startedAt: "2026-02-06T05:00:20.000Z",
        endedAt: null,
      }),
    ]);

    clock.set("2026-02-06T05:01:00.000Z");
    const timeline = store.getTimeline({ paneId: "%out-of-order-closed", range: "1h" });

    // The intervening zero-duration WAITING_INPUT event is dropped, and the
    // two RUNNING events remain separate (not merged) because they are not
    // adjacent in the underlying event list.
    expect(timeline.items).toHaveLength(2);
    expect(timeline.items[0]?.state).toBe("RUNNING");
    expect(timeline.items[0]?.startedAt).toBe("2026-02-06T05:00:20.000Z");
    expect(timeline.items[0]?.endedAt).toBeNull();
    expect(timeline.items[1]?.state).toBe("RUNNING");
    expect(timeline.items[1]?.startedAt).toBe("2026-02-06T05:00:00.000Z");
    expect(timeline.items[1]?.endedAt).toBe("2026-02-06T05:00:20.000Z");
    expect(timeline.items[1]?.durationMs).toBe(20_000);
  });

  it("clamps closePane's endedAt to the event's own start when `at` is earlier", () => {
    const clock = nowAt;
    clock.set("2026-02-06T06:00:00.000Z");
    const store = createSessionTimelineStore({ now: clock.now });

    store.record({
      paneId: "%close-early",
      state: "RUNNING",
      reason: "hook:PreToolUse",
      at: "2026-02-06T06:00:30.000Z",
      source: "hook",
    });

    clock.set("2026-02-06T06:01:00.000Z");
    store.closePane({ paneId: "%close-early", at: "2026-02-06T06:00:00.000Z" });

    const persisted = store.serialize();
    expect(persisted["%close-early"]).toEqual([
      expect.objectContaining({
        state: "RUNNING",
        startedAt: "2026-02-06T06:00:30.000Z",
        endedAt: "2026-02-06T06:00:30.000Z",
      }),
    ]);

    // The collapsed zero-duration event has no observable interval and no
    // longer counts as "current".
    const timeline = store.getTimeline({ paneId: "%close-early", range: "1h" });
    expect(timeline.items).toHaveLength(0);
    expect(timeline.current).toBeNull();
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
