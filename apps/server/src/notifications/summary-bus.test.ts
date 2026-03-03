import { describe, expect, it } from "vitest";

import { createSummaryBus } from "./summary-bus";

const createRequest = ({
  eventId = "evt-1",
  sequence = 1,
  sourceEventAt = "2026-03-02T00:00:01.000Z",
}: {
  eventId?: string;
  sequence?: number;
  sourceEventAt?: string;
} = {}) => ({
  schemaVersion: 1 as const,
  eventId,
  locator: {
    source: "claude" as const,
    runId: "run-1",
    paneId: "%1",
    eventType: "pane.task_completed" as const,
    sequence,
  },
  sourceEventAt,
  summary: {
    paneTitle: "done",
    notificationTitle: "task done",
    notificationBody: "task completed",
  },
});

describe("createSummaryBus", () => {
  it("consumes buffered publish on wait", async () => {
    const bus = createSummaryBus();
    const publishResult = bus.publish(createRequest());
    expect(publishResult).toEqual({
      ok: true,
      eventId: "evt-1",
      deduplicated: false,
    });

    const result = await bus.waitForSummary({
      binding: {
        source: "claude",
        runId: "run-1",
        paneId: "%1",
        eventType: "pane.task_completed",
        sequence: 1,
      },
      minSourceEventAt: "2026-03-02T00:00:00.000Z",
      waitMs: 1500,
    });

    expect(result.result).toBe("hit");
    if (result.result !== "hit") {
      return;
    }
    expect(result.event.eventId).toBe("evt-1");
    expect(result.event.summary.notificationTitle).toBe("task done");
  });

  it("times out when no publish arrives", async () => {
    const bus = createSummaryBus();
    const result = await bus.waitForSummary({
      binding: {
        source: "codex",
        runId: "run-1",
        paneId: "%1",
        eventType: "pane.task_completed",
        sequence: 1,
      },
      minSourceEventAt: "2026-03-02T00:00:00.000Z",
      waitMs: 10,
    });

    expect(result.result).toBe("timeout");
  });

  it("returns deduplicated on same eventId + locator re-publish", () => {
    const bus = createSummaryBus();
    const first = bus.publish(createRequest({ eventId: "evt-1", sequence: 1 }));
    const second = bus.publish(createRequest({ eventId: "evt-1", sequence: 1 }));

    expect(first).toEqual({
      ok: true,
      eventId: "evt-1",
      deduplicated: false,
    });
    expect(second).toEqual({
      ok: true,
      eventId: "evt-1",
      deduplicated: true,
    });
  });

  it("rejects same locator with different eventId", () => {
    const bus = createSummaryBus();
    const first = bus.publish(createRequest({ eventId: "evt-1", sequence: 1 }));
    const second = bus.publish(createRequest({ eventId: "evt-2", sequence: 1 }));

    expect(first.ok).toBe(true);
    expect(second).toEqual({
      ok: false,
      code: "invalid_request",
      message: "eventId mismatch for the same locator",
      eventId: "evt-2",
    });
  });

  it("rejects eventId reuse on another locator", () => {
    const bus = createSummaryBus();
    const first = bus.publish(createRequest({ eventId: "evt-1", sequence: 1 }));
    const second = bus.publish(createRequest({ eventId: "evt-1", sequence: 2 }));

    expect(first.ok).toBe(true);
    expect(second).toEqual({
      ok: false,
      code: "invalid_request",
      message: "eventId was already used for another locator",
      eventId: "evt-1",
    });
  });

  it("rejects wait when maxWaiters is exceeded", async () => {
    const bus = createSummaryBus({ maxWaiters: 1 });
    const firstWait = bus.waitForSummary({
      binding: {
        source: "claude",
        runId: "run-1",
        paneId: "%1",
        eventType: "pane.task_completed",
        sequence: 1,
      },
      minSourceEventAt: "2026-03-02T00:00:00.000Z",
      waitMs: 30,
    });
    const overflow = await bus.waitForSummary({
      binding: {
        source: "claude",
        runId: "run-1",
        paneId: "%1",
        eventType: "pane.task_completed",
        sequence: 1,
      },
      minSourceEventAt: "2026-03-02T00:00:00.000Z",
      waitMs: 30,
    });
    expect(overflow).toEqual({
      result: "rejected",
      waitedMs: 0,
      reasonCode: "waiter_overflow",
    });
    await firstWait;
  });

  it("matches summary to the closest sequence waiter when waits overlap", async () => {
    const bus = createSummaryBus();
    const firstWait = bus.waitForSummary({
      binding: {
        source: "claude",
        runId: "run-1",
        paneId: "%1",
        eventType: "pane.task_completed",
        sequence: 1772409600000,
      },
      minSourceEventAt: "2026-03-02T00:00:00.000Z",
      waitMs: 20,
    });
    const secondWait = bus.waitForSummary({
      binding: {
        source: "claude",
        runId: "run-1",
        paneId: "%1",
        eventType: "pane.task_completed",
        sequence: 1772409600010,
      },
      minSourceEventAt: "2026-03-02T00:00:00.000Z",
      waitMs: 20,
    });

    const publishResult = bus.publish(
      createRequest({
        eventId: "evt-seq-2",
        sequence: 1772409600010,
        sourceEventAt: "2026-03-02T00:00:00.010Z",
      }),
    );
    expect(publishResult).toEqual({
      ok: true,
      eventId: "evt-seq-2",
      deduplicated: false,
    });

    const [firstResult, secondResult] = await Promise.all([firstWait, secondWait]);
    expect(firstResult.result).toBe("timeout");
    expect(secondResult.result).toBe("hit");
    if (secondResult.result !== "hit") {
      return;
    }
    expect(secondResult.event.eventId).toBe("evt-seq-2");
  });

  it("keeps locator uniqueness after deduplicated re-publish", () => {
    let currentNowMs = 0;
    const bus = createSummaryBus({
      nowMs: () => currentNowMs,
      bufferMs: 30_000,
    });
    const first = bus.publish(createRequest({ eventId: "evt-1", sequence: 1 }));
    currentNowMs = 25_000;
    const deduped = bus.publish(createRequest({ eventId: "evt-1", sequence: 1 }));
    currentNowMs = 31_000;
    const conflict = bus.publish(createRequest({ eventId: "evt-2", sequence: 1 }));

    expect(first).toEqual({
      ok: true,
      eventId: "evt-1",
      deduplicated: false,
    });
    expect(deduped).toEqual({
      ok: true,
      eventId: "evt-1",
      deduplicated: true,
    });
    expect(conflict).toEqual({
      ok: false,
      code: "invalid_request",
      message: "eventId mismatch for the same locator",
      eventId: "evt-2",
    });
  });
});
