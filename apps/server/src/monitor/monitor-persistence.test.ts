import { describe, expect, it, vi } from "vitest";

import type { PersistedSessionMap, PersistedTimelineMap } from "../state-store";
import {
  resolvePersistedSessionRuntimeState,
  restoreMonitorRuntimeState,
} from "./monitor-persistence";
import { createPaneStateStore } from "./pane-state";

describe("restoreMonitorRuntimeState", () => {
  it("hydrates pane runtime state and records restore timeline when missing", () => {
    const restoredSessions: PersistedSessionMap = new Map([
      [
        "%1",
        {
          paneId: "%1",
          lastOutputAt: "2024-01-01T00:00:00.000Z",
          lastEventAt: "2024-01-01T00:00:01.000Z",
          lastMessage: "message",
          lastInputAt: "2024-01-01T00:00:02.000Z",
          agentSessionId: "session-1",
          agentSessionSource: "hook",
          agentSessionConfidence: "high",
          agentSessionObservedAt: "2024-01-01T00:00:01.000Z",
          customTitle: "Custom",
          lifecycle: "RUNNING",
          completionCursor: {
            epoch: "epoch-1",
            paneInstanceKey: "instance-1",
            agent: "codex",
            agentSessionId: "session-1",
            identityConfirmedAt: "2024-01-01T00:00:01.000Z",
            agentPresent: true,
            syntheticCompletionArmed: false,
            consecutiveAbsentObservations: 0,
            runSeq: 1,
            openRunSeq: 1,
            completedSeq: 0,
            acknowledgedSeq: 0,
          },
          lastAgent: "codex",
          stateReason: "restored",
          repoRoot: "/repo/a",
        },
      ],
      [
        "%2",
        {
          paneId: "%2",
          lastOutputAt: null,
          lastEventAt: null,
          lastMessage: null,
          lastInputAt: null,
          agentSessionId: null,
          agentSessionSource: null,
          agentSessionConfidence: null,
          agentSessionObservedAt: null,
          customTitle: null,
          lifecycle: "WAITING_INPUT",
          completionCursor: null,
          lastAgent: "unknown",
          stateReason: "restored",
          repoRoot: "/repo/b",
        },
      ],
    ]);
    const restoredTimeline: PersistedTimelineMap = new Map([
      [
        "%1",
        [
          {
            id: "%1:1:1",
            paneId: "%1",
            state: "RUNNING",
            reason: "restored",
            startedAt: "2024-01-01T00:00:00.000Z",
            endedAt: null,
            source: "restore",
          },
        ],
      ],
    ]);
    const paneStates = createPaneStateStore();
    const customTitles = new Map<string, string>();
    const timelineStore = {
      restore: vi.fn(),
      record: vi.fn(),
    };

    restoreMonitorRuntimeState({
      restoredSessions,
      restoredTimeline,
      paneStates,
      customTitles,
      stateTimeline: timelineStore,
    });

    expect(timelineStore.restore).toHaveBeenCalledWith(restoredTimeline);
    expect(timelineStore.record).toHaveBeenCalledTimes(1);
    expect(timelineStore.record).toHaveBeenCalledWith(
      expect.objectContaining({
        paneId: "%2",
        state: "WAITING_INPUT",
        repoRoot: "/repo/b",
        source: "restore",
      }),
    );
    expect(paneStates.get("%1")).toEqual(
      expect.objectContaining({
        lastOutputAt: "2024-01-01T00:00:00.000Z",
        lastEventAt: "2024-01-01T00:00:01.000Z",
        lastMessage: "message",
        lastInputAt: "2024-01-01T00:00:02.000Z",
        agentSessionId: null,
        agentSessionSource: null,
        agentSessionConfidence: null,
        agentSessionObservedAt: null,
        lifecycle: "RUNNING",
        completionCursor: expect.objectContaining({ epoch: "epoch-1" }),
        pendingRestoredCompletionCursor: expect.objectContaining({ epoch: "epoch-1" }),
        pendingRestoredLifecycle: "RUNNING",
        pendingRestoredLastAgent: "codex",
        lastResolvedAgent: "codex",
        agentPresent: true,
        consecutiveAbsentObservations: 0,
        lastResolvedState: "RUNNING",
        lastResolvedStateReason: "restored",
      }),
    );
    expect(customTitles.get("%1")).toBe("Custom");
    expect(customTitles.has("%2")).toBe(false);
  });

  it("keeps an unvalidated restored cursor in the next persisted runtime snapshot", () => {
    const paneState = createPaneStateStore().get("%1");
    paneState.lifecycle = "WAITING_INPUT";
    paneState.lastResolvedAgent = "codex";
    paneState.pendingRestoredLifecycle = "WAITING_INPUT";
    paneState.pendingRestoredLastAgent = "codex";
    paneState.pendingRestoredCompletionCursor = {
      epoch: "pending-epoch",
      paneInstanceKey: "instance-1",
      agent: "codex",
      agentSessionId: "session-1",
      identityConfirmedAt: "2024-01-01T00:00:00.000Z",
      agentPresent: true,
      syntheticCompletionArmed: false,
      consecutiveAbsentObservations: 1,
      runSeq: 1,
      openRunSeq: null,
      completedSeq: 1,
      acknowledgedSeq: 0,
    };

    expect(resolvePersistedSessionRuntimeState(paneState)).toEqual({
      lifecycle: "WAITING_INPUT",
      completionCursor: expect.objectContaining({
        epoch: "pending-epoch",
        consecutiveAbsentObservations: 1,
      }),
      lastAgent: "codex",
    });

    paneState.completionCursor = { ...paneState.pendingRestoredCompletionCursor };
    paneState.agentPresence = "indeterminate";
    const persistedRuntime = resolvePersistedSessionRuntimeState(paneState);
    expect(persistedRuntime.completionCursor).toMatchObject({
      epoch: "pending-epoch",
      completedSeq: 1,
      acknowledgedSeq: 0,
    });

    const restoredAgainStates = createPaneStateStore();
    restoreMonitorRuntimeState({
      restoredSessions: new Map([
        [
          "%1",
          {
            paneId: "%1",
            lastOutputAt: null,
            lastEventAt: null,
            lastMessage: null,
            lastInputAt: null,
            customTitle: null,
            stateReason: "restored",
            ...persistedRuntime,
          },
        ],
      ]),
      restoredTimeline: new Map(),
      paneStates: restoredAgainStates,
      customTitles: new Map(),
      stateTimeline: { restore: vi.fn(), record: vi.fn() },
    });
    expect(restoredAgainStates.get("%1")).toMatchObject({
      lifecycle: "WAITING_INPUT",
      completionCursor: expect.objectContaining({ epoch: "pending-epoch" }),
      pendingRestoredCompletionCursor: expect.objectContaining({ epoch: "pending-epoch" }),
      lastResolvedAgent: "codex",
    });
  });
});
