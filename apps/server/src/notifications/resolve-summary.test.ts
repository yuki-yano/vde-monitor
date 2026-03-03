import { type SessionDetail, configDefaults } from "@vde-monitor/shared";
import { describe, expect, it, vi } from "vitest";

import { createResolveSummary } from "./resolve-summary";
import type { SessionTransitionEvent } from "./types";

const createDetail = (
  state: SessionDetail["state"],
  agent: SessionDetail["agent"],
): SessionDetail => ({
  paneId: "%1",
  sessionName: "backend",
  windowIndex: 0,
  paneIndex: 0,
  windowActivity: null,
  paneActive: true,
  currentCommand: null,
  currentPath: "/repo",
  paneTty: "tty1",
  title: null,
  customTitle: null,
  repoRoot: "/repo",
  agent,
  state,
  stateReason: "reason",
  lastMessage: null,
  lastOutputAt: null,
  lastEventAt: "2026-03-02T00:00:00.000Z",
  lastInputAt: null,
  paneDead: false,
  alternateOn: false,
  pipeAttached: false,
  pipeConflict: false,
  startCommand: null,
  panePid: null,
  agentSessionId: agent === "claude" ? "session-1" : null,
  agentSessionSource: null,
  agentSessionConfidence: null,
  agentSessionObservedAt: null,
});

const createTransition = (): SessionTransitionEvent => ({
  paneId: "%1",
  previous: createDetail("RUNNING", "claude"),
  next: createDetail("WAITING_INPUT", "claude"),
  at: "2026-03-02T00:00:00.000Z",
  source: "poll",
});

describe("createResolveSummary", () => {
  it("returns disabled when summary feature is disabled", async () => {
    const config = {
      ...configDefaults,
      token: "token",
      notifications: {
        ...configDefaults.notifications,
        summary: {
          ...configDefaults.notifications.summary,
          enabled: false,
        },
      },
    };
    const summaryBus = {
      waitForSummary: vi.fn(),
    };
    const resolver = createResolveSummary({
      config,
      summaryBus: summaryBus as never,
    });

    const result = await resolver.resolveSummary(createTransition());
    expect(result).toEqual({
      result: "disabled",
      reasonCode: "disabled",
      waitedMs: 0,
    });
    expect(summaryBus.waitForSummary).not.toHaveBeenCalled();
  });

  it("returns hit with normalized payload", async () => {
    const config = {
      ...configDefaults,
      token: "token",
      notifications: {
        ...configDefaults.notifications,
        summary: {
          ...configDefaults.notifications.summary,
          enabled: true,
        },
      },
    };
    const summaryBus = {
      waitForSummary: vi.fn(async () => ({
        result: "hit" as const,
        waitedMs: 150,
        event: {
          eventId: "evt-1",
          locator: {
            source: "claude" as const,
            runId: "session-1",
            paneId: "%1",
            eventType: "pane.task_completed" as const,
            sequence: 1,
          },
          sourceEventAt: "2026-03-02T00:00:00.100Z",
          summary: {
            paneTitle: "done",
            notificationTitle: "task done",
            notificationBody: "task completed",
          },
        },
      })),
    };
    const resolver = createResolveSummary({
      config,
      summaryBus: summaryBus as never,
    });

    const result = await resolver.resolveSummary(createTransition());
    expect(result.result).toBe("hit");
    expect(summaryBus.waitForSummary).toHaveBeenCalledWith({
      binding: {
        source: "claude",
        runId: "session-1",
        paneId: "%1",
        eventType: "pane.task_completed",
        sequence: 1772409600000,
      },
      minSourceEventAt: "2026-03-02T00:00:00.000Z",
      waitMs: config.notifications.summary.sources.claude.waitMs,
    });
  });
});
