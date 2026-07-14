import { describe, expect, it } from "vitest";

import { createRepositoryActivityStore } from "./store";

const at = (value: number) => new Date(value).toISOString();

describe("createRepositoryActivityStore", () => {
  it("aggregates repository active time in one interval pass while preserving agent time", () => {
    let nowMs = Date.parse("2026-07-11T00:00:00.000Z");
    const store = createRepositoryActivityStore({ now: () => new Date(nowMs) });

    store.observePane({
      paneId: "%1",
      running: true,
      repoRoot: "/work/a",
      runId: "epoch-a:1",
      verified: true,
      at: at(nowMs),
    });
    nowMs += 5_000;
    store.observePane({
      paneId: "%2",
      running: true,
      repoRoot: "/work/a",
      runId: "epoch-a:2",
      verified: true,
      at: at(nowMs),
    });
    nowMs += 5_000;
    store.closePane("%1", at(nowMs));
    nowMs += 5_000;
    store.closePane("%2", at(nowMs));
    nowMs += 1_000;
    store.recordCompletedRun({
      epoch: "epoch-a",
      runSeq: 1,
      repoRoot: "/work/a",
      source: "hook:stop",
      at: at(nowMs),
    });
    store.recordCompletedRun({
      epoch: "epoch-a",
      runSeq: 1,
      repoRoot: "/work/a",
      source: "hook:stop",
      at: at(nowMs),
    });
    store.recordCompletedRun({
      epoch: "epoch-a",
      runSeq: 2,
      repoRoot: "/work/a",
      source: "hook:stop",
      at: at(nowMs),
    });

    const activity = store.getActivity("15m");

    expect(activity.coverage).toMatchObject({
      status: "partial",
      gapDurationMs: 15 * 60 * 1000 - 16_000,
    });
    expect(activity.items).toEqual([
      expect.objectContaining({
        repoKey: "/work/a",
        repoRoot: "/work/a",
        repoName: "a",
        activeTimeMs: 15_000,
        agentTimeMs: 20_000,
        completedRunCount: 2,
        lastActiveAt: at(nowMs),
      }),
    ]);
  });

  it("closes a restored open interval at savedAt and reports the restart as a coverage gap", () => {
    let nowMs = Date.parse("2026-07-11T00:00:00.000Z");
    const firstStore = createRepositoryActivityStore({ now: () => new Date(nowMs) });
    firstStore.observePane({
      paneId: "%1",
      running: true,
      repoRoot: "/work/a",
      runId: "epoch-a:1",
      verified: true,
      at: at(nowMs),
    });
    nowMs += 10_000;
    const persisted = firstStore.serialize();

    nowMs += 10_000;
    const restoredStore = createRepositoryActivityStore({ now: () => new Date(nowMs) });
    restoredStore.restore(persisted);

    const activity = restoredStore.getActivity("15m");

    expect(activity.coverage).toMatchObject({
      status: "partial",
      trackingStartedAt: at(Date.parse("2026-07-11T00:00:00.000Z")),
      gapDurationMs: 15 * 60 * 1000 - 10_000,
    });
    expect(activity.items).toEqual([
      expect.objectContaining({ activeTimeMs: 10_000, agentTimeMs: 10_000 }),
    ]);
  });

  it("reopens a previously verified run after restart without counting the offline gap", () => {
    let nowMs = Date.parse("2026-07-11T00:00:00.000Z");
    const firstStore = createRepositoryActivityStore({ now: () => new Date(nowMs) });
    firstStore.observePane({
      paneId: "%1",
      running: true,
      repoRoot: "/work/a",
      runId: "epoch-a:1",
      verified: true,
    });
    nowMs += 10_000;
    const persisted = firstStore.serialize();
    nowMs += 10_000;

    const restoredStore = createRepositoryActivityStore({ now: () => new Date(nowMs) });
    restoredStore.restore(persisted);
    restoredStore.observePane({
      paneId: "%1",
      running: true,
      repoRoot: "/work/a",
      runId: "epoch-a:1",
      verified: false,
    });
    nowMs += 10_000;
    restoredStore.closePane("%1");

    expect(restoredStore.getActivity("15m")).toMatchObject({
      coverage: { gapDurationMs: 15 * 60 * 1000 - 20_000 },
      items: [{ activeTimeMs: 20_000, agentTimeMs: 20_000 }],
    });
  });

  it("keeps completion deduplication after restore", () => {
    let nowMs = Date.parse("2026-07-11T00:00:00.000Z");
    const firstStore = createRepositoryActivityStore({ now: () => new Date(nowMs) });
    firstStore.recordCompletedRun({
      epoch: "epoch-a",
      runSeq: 1,
      repoRoot: "/work/a",
      source: "hook:stop",
    });
    const persisted = firstStore.serialize();
    nowMs += 1_000;

    const restoredStore = createRepositoryActivityStore({ now: () => new Date(nowMs) });
    restoredStore.restore(persisted);
    restoredStore.recordCompletedRun({
      epoch: "epoch-a",
      runSeq: 1,
      repoRoot: "/work/a",
      source: "hook:stop",
    });

    expect(restoredStore.getActivity("15m").items).toEqual([
      expect.objectContaining({ completedRunCount: 1 }),
    ]);
  });

  it("resets coverage instead of partially restoring an invalid activity snapshot", () => {
    const nowMs = Date.parse("2026-07-11T00:10:00.000Z");
    const store = createRepositoryActivityStore({ now: () => new Date(nowMs) });

    store.restore({
      trackingStartedAt: "2026-07-11T00:00:00.000Z",
      savedAt: "2026-07-11T00:05:00.000Z",
      intervals: [
        {
          id: "%1:1",
          paneId: "%1",
          repoRoot: "/work/a",
          runId: "epoch-a:1",
          startedAt: "2026-07-11T00:00:00.000Z",
          endedAt: "2026-07-11T00:01:00.000Z",
        },
      ],
      completedRuns: [],
      gaps: [],
    });

    const activity = store.getActivity("15m");
    expect(activity.items).toEqual([]);
    expect(activity.coverage).toMatchObject({
      trackingStartedAt: at(nowMs),
      gapDurationMs: 15 * 60 * 1000,
    });
  });

  it("merges overlapping pane observation failures into one coverage gap", () => {
    let nowMs = Date.parse("2026-07-11T00:00:00.000Z");
    const store = createRepositoryActivityStore({ now: () => new Date(nowMs) });
    const startedAtMs = nowMs;
    nowMs += 15 * 60_000;

    store.recordCoverageGap({
      startedAt: at(startedAtMs + 2 * 60_000),
      endedAt: at(startedAtMs + 4 * 60_000),
    });
    store.recordCoverageGap({
      startedAt: at(startedAtMs + 3 * 60_000),
      endedAt: at(startedAtMs + 6 * 60_000),
    });

    expect(store.getActivity("15m").coverage.gapDurationMs).toBe(4 * 60_000);
  });

  it("separates unassigned running time from repository metrics", () => {
    let nowMs = Date.parse("2026-07-11T00:00:00.000Z");
    const store = createRepositoryActivityStore({ now: () => new Date(nowMs) });
    store.observePane({
      paneId: "%1",
      running: true,
      repoRoot: null,
      runId: "epoch-a:1",
      verified: true,
      at: at(nowMs),
    });
    nowMs += 4_000;
    store.closePane("%1", at(nowMs));
    store.recordCompletedRun({
      epoch: "epoch-a",
      runSeq: 1,
      repoRoot: null,
      source: "hook:stop",
      at: at(nowMs),
    });

    const activity = store.getActivity("15m");

    expect(activity.items).toEqual([]);
    expect(activity.coverage.unattributedRunningMs).toBe(4_000);
    expect(activity.coverage.unattributedCompletedRunCount).toBe(1);
    expect(activity.coverage.unverifiedCompletedRunCount).toBe(0);
  });

  it("ignores poll-only running fragments while retaining explicit completions", () => {
    let nowMs = Date.parse("2026-07-11T00:00:00.000Z");
    const store = createRepositoryActivityStore({ now: () => new Date(nowMs) });

    store.observePane({
      paneId: "%1",
      running: true,
      repoRoot: "/work/a",
      runId: "epoch-a:1",
      verified: false,
    });
    nowMs += 10_000;
    store.observePane({
      paneId: "%1",
      running: false,
      repoRoot: "/work/a",
      runId: null,
      verified: false,
    });
    store.recordCompletedRun({
      epoch: "epoch-a",
      runSeq: 1,
      repoRoot: "/work/a",
      source: "hook:stop",
    });

    nowMs += 15 * 60_000 - 10_000;

    const activity = store.getActivity("15m");

    expect(activity.coverage).toMatchObject({
      status: "partial",
      gapDurationMs: 0,
      unattributedCompletedRunCount: 0,
      unverifiedCompletedRunCount: 1,
    });
    expect(activity.items).toEqual([
      expect.objectContaining({
        activeTimeMs: 0,
        agentTimeMs: 0,
        completedRunCount: 1,
      }),
    ]);
  });

  it("keeps one interval and one completion for repeated observations of the same run", () => {
    let nowMs = Date.parse("2026-07-11T00:00:00.000Z");
    const store = createRepositoryActivityStore({ now: () => new Date(nowMs) });

    store.observePane({
      paneId: "%1",
      running: true,
      repoRoot: "/work/a",
      runId: "epoch-a:1",
      verified: true,
    });
    nowMs += 5_000;
    store.observePane({
      paneId: "%1",
      running: true,
      repoRoot: "/work/a",
      runId: "epoch-a:1",
      verified: false,
    });
    nowMs += 5_000;
    store.observePane({
      paneId: "%1",
      running: false,
      repoRoot: "/work/a",
      runId: null,
      verified: false,
    });
    store.recordCompletedRun({
      epoch: "epoch-a",
      runSeq: 1,
      repoRoot: "/work/a",
      source: "hook:stop",
    });
    store.recordCompletedRun({
      epoch: "epoch-a",
      runSeq: 1,
      repoRoot: "/work/a",
      source: "hook:stop",
    });

    expect(store.getActivity("15m").items).toEqual([
      expect.objectContaining({
        activeTimeMs: 10_000,
        agentTimeMs: 10_000,
        completedRunCount: 1,
      }),
    ]);
  });

  it("does not overlap a closed interval when delayed verification reopens the same run", () => {
    let nowMs = Date.parse("2026-07-11T00:00:00.000Z");
    const store = createRepositoryActivityStore({ now: () => new Date(nowMs) });

    store.observePane({
      paneId: "%1",
      running: true,
      repoRoot: "/work/a",
      runId: "epoch-a:1",
      verified: true,
    });
    nowMs += 5_000;
    store.closePane("%1");
    nowMs += 5_000;
    store.observePane({
      paneId: "%1",
      running: true,
      repoRoot: "/work/a",
      runId: "epoch-a:1",
      verified: true,
      at: at(nowMs - 6_000),
    });
    nowMs += 5_000;
    store.closePane("%1");

    expect(store.getActivity("15m").items).toEqual([
      expect.objectContaining({
        activeTimeMs: 10_000,
        agentTimeMs: 10_000,
      }),
    ]);
    expect(store.serialize().intervals).toEqual([
      expect.objectContaining({
        startedAt: "2026-07-11T00:00:00.000Z",
        endedAt: "2026-07-11T00:00:05.000Z",
      }),
      expect.objectContaining({
        startedAt: "2026-07-11T00:00:10.000Z",
        endedAt: "2026-07-11T00:00:15.000Z",
      }),
    ]);
  });

  it("splits one pane between repositories without creating overlapping intervals", () => {
    let nowMs = Date.parse("2026-07-11T00:00:10.000Z");
    const store = createRepositoryActivityStore({ now: () => new Date(nowMs) });

    store.observePane({
      paneId: "%1",
      running: true,
      repoRoot: "/work/a",
      runId: "epoch-a:1",
      verified: true,
      at: "2026-07-11T00:00:10.000Z",
    });
    nowMs += 10_000;
    store.observePane({
      paneId: "%1",
      running: true,
      repoRoot: "/work/b",
      runId: "epoch-a:1",
      verified: false,
      at: "2026-07-11T00:00:05.000Z",
    });
    nowMs += 10_000;
    store.closePane("%1");

    const items = store.getActivity("15m").items;
    expect(items.find((item) => item.repoRoot === "/work/a")).toBeUndefined();
    expect(items.find((item) => item.repoRoot === "/work/b")).toMatchObject({
      activeTimeMs: 20_000,
      agentTimeMs: 20_000,
    });
  });
});
