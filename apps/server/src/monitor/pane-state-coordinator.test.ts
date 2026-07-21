import type { PaneMeta } from "@vde-monitor/multiplexer";
import type { SessionDetail } from "@vde-monitor/shared";
import { describe, expect, it } from "vitest";

import { createRepositoryActivityStore } from "../repository-activity/store";
import { createPaneStateStore } from "./pane-state";
import { createPaneInstanceKey, createPaneStateCoordinator } from "./pane-state-coordinator";

const pane: PaneMeta = {
  paneId: "%1",
  sessionId: "$1",
  sessionName: "main",
  windowId: "@0",
  windowIndex: 0,
  paneIndex: 0,
  windowActivity: null,
  paneActivity: null,
  paneActive: true,
  currentCommand: "codex",
  currentPath: "/repo",
  paneTty: "ttys001",
  paneDead: false,
  panePipe: false,
  alternateOn: false,
  panePid: 100,
  paneTitle: null,
  paneStartCommand: "codex",
  pipeTagValue: null,
};

const detail = (overrides: Partial<SessionDetail> = {}): SessionDetail => ({
  paneId: "%1",
  sessionId: "$1",
  sessionName: "main",
  windowId: "@0",
  windowIndex: 0,
  paneIndex: 0,
  paneActive: true,
  currentCommand: "codex",
  currentPath: "/repo",
  paneTty: "ttys001",
  title: null,
  customTitle: null,
  repoRoot: "/repo",
  agent: "codex",
  state: "RUNNING",
  stateReason: "hook:UserPromptSubmit",
  lastMessage: null,
  lastOutputAt: null,
  lastEventAt: null,
  lastInputAt: null,
  lastRunStartedAt: null,
  manualSortAt: null,
  agentSessionId: null,
  agentSessionSource: null,
  agentSessionConfidence: null,
  agentSessionObservedAt: null,
  paneDead: false,
  alternateOn: false,
  pipeAttached: false,
  pipeConflict: false,
  startCommand: "codex",
  panePid: 100,
  completion: null,
  ...overrides,
});

const createCoordinator = (now = "2026-07-10T00:00:00.000Z") => {
  let sequence = 0;
  return createPaneStateCoordinator({
    serverKey: "server",
    createEpoch: () => `epoch-${++sequence}`,
    now: () => now,
  });
};

describe("createPaneStateCoordinator", () => {
  it("records only the event that opens a hook run", () => {
    const paneState = createPaneStateStore().get("%1");
    paneState.agentPresence = "present";
    paneState.pendingAgentLifecycleEvents.push(
      {
        source: "hook",
        agent: "codex",
        eventName: "UserPromptSubmit",
        sessionId: "session-1",
        at: "2026-07-10T00:00:01.000Z",
      },
      {
        source: "hook",
        agent: "codex",
        eventName: "PreToolUse",
        sessionId: "session-1",
        at: "2026-07-10T00:00:02.000Z",
      },
    );

    const commit = createCoordinator().applyObservation({
      pane,
      detail: detail({ state: "RUNNING", stateReason: "hook:PreToolUse" }),
      paneState,
    });

    expect(paneState.lastRunStartedAt).toBe("2026-07-10T00:00:01.000Z");
    expect(commit.detail.lastRunStartedAt).toBe("2026-07-10T00:00:01.000Z");
    expect(commit.activityTransitions).toEqual([
      { type: "start", epoch: "epoch-1", runSeq: 1, at: "2026-07-10T00:00:01.000Z" },
    ]);
  });

  it("does not record a sort timestamp for an unverified poll-opened run", () => {
    const paneState = createPaneStateStore().get("%1");
    paneState.agentPresence = "present";
    const coordinator = createCoordinator("2026-07-10T00:00:05.000Z");

    const first = coordinator.applyObservation({
      pane,
      detail: detail({ state: "RUNNING", stateReason: "poll" }),
      paneState,
    });
    const second = coordinator.applyObservation({
      pane,
      detail: detail({ state: "WAITING_INPUT", stateReason: "inactive_timeout" }),
      paneState,
    });
    const third = coordinator.applyObservation({
      pane,
      detail: detail({ state: "RUNNING", stateReason: "recent_output" }),
      paneState,
    });

    expect(first.activityTransitions).toEqual([]);
    expect(second.activityTransitions).toEqual([]);
    expect(third.activityTransitions).toEqual([]);
    expect(paneState.lastRunStartedAt).toBeNull();
    expect(first.detail.lastRunStartedAt).toBeNull();
    expect(second.detail.lastRunStartedAt).toBeNull();
    expect(third.detail.lastRunStartedAt).toBeNull();
  });

  it.each(["UserPromptSubmit", "PreToolUse", "PostToolUse"] as const)(
    "verifies a poll-opened run when %s arrives later",
    (eventName) => {
      const paneState = createPaneStateStore().get("%1");
      paneState.agentPresence = "present";
      const coordinator = createCoordinator("2026-07-10T00:00:05.000Z");

      const polled = coordinator.applyObservation({
        pane,
        detail: detail({ state: "RUNNING", stateReason: "poll" }),
        paneState,
      });
      paneState.pendingAgentLifecycleEvents.push({
        source: "hook",
        agent: "codex",
        eventName,
        sessionId: "session-1",
        at: "2026-07-10T00:00:06.000Z",
      });
      const verified = coordinator.applyObservation({
        pane,
        detail: detail({ state: "RUNNING", stateReason: `hook:${eventName}` }),
        paneState,
      });

      expect(polled.activityTransitions).toEqual([]);
      expect(verified.activityTransitions).toEqual([
        { type: "start", epoch: "epoch-1", runSeq: 1, at: "2026-07-10T00:00:06.000Z" },
      ]);
      expect(paneState.lastRunStartedAt).toBe("2026-07-10T00:00:06.000Z");
      expect(paneState.completionCursor).toMatchObject({
        epoch: "epoch-1",
        runSeq: 1,
        openRunSeq: 1,
      });
    },
  );

  it("verifies a poll-opened run when herdr working arrives later", () => {
    const paneState = createPaneStateStore().get("%1");
    paneState.agentPresence = "present";
    const coordinator = createCoordinator("2026-07-10T00:00:05.000Z");

    const polled = coordinator.applyObservation({
      pane,
      detail: detail({ state: "RUNNING", stateReason: "poll" }),
      paneState,
    });
    paneState.pendingAgentLifecycleEvents.push({
      source: "herdr",
      agentStatus: "working",
      at: "2026-07-10T00:00:06.000Z",
    });
    const verified = coordinator.applyObservation({
      pane,
      detail: detail({ state: "RUNNING", stateReason: "herdr:working" }),
      paneState,
    });

    expect(polled.activityTransitions).toEqual([]);
    expect(verified.activityTransitions).toEqual([
      { type: "start", epoch: "epoch-1", runSeq: 1, at: "2026-07-10T00:00:06.000Z" },
    ]);
    expect(paneState.lastRunStartedAt).toBe("2026-07-10T00:00:06.000Z");
    expect(paneState.completionCursor).toMatchObject({
      epoch: "epoch-1",
      runSeq: 1,
      openRunSeq: 1,
    });
  });

  it("keeps one repository activity interval when repeated hooks verify the same run", () => {
    let nowMs = Date.parse("2026-07-10T00:00:05.000Z");
    const repositoryActivity = createRepositoryActivityStore({ now: () => new Date(nowMs) });
    const paneState = createPaneStateStore().get("%1");
    paneState.agentPresence = "present";
    const coordinator = createCoordinator(new Date(nowMs).toISOString());
    const observeActivity = (commit: ReturnType<typeof coordinator.applyObservation>) => {
      commit.activityTransitions.forEach((transition) => {
        repositoryActivity.observePane({
          paneId: pane.paneId,
          running: transition.type === "start",
          repoRoot: "/repo",
          runId: `${transition.epoch}:${transition.runSeq}`,
          verified: transition.type === "start",
          at: transition.at,
        });
      });
      const cursor = paneState.completionCursor;
      repositoryActivity.observePane({
        paneId: pane.paneId,
        running: paneState.lifecycle === "RUNNING",
        repoRoot: "/repo",
        runId: cursor?.openRunSeq == null ? null : `${cursor.epoch}:${cursor.openRunSeq}`,
        verified: false,
      });
    };

    observeActivity(
      coordinator.applyObservation({
        pane,
        detail: detail({ state: "RUNNING", stateReason: "poll" }),
        paneState,
      }),
    );
    for (const eventName of ["UserPromptSubmit", "PreToolUse", "PostToolUse"] as const) {
      nowMs += 1_000;
      paneState.pendingAgentLifecycleEvents.push({
        source: "hook",
        agent: "codex",
        eventName,
        sessionId: "session-1",
        at: new Date(nowMs).toISOString(),
      });
      observeActivity(
        coordinator.applyObservation({
          pane,
          detail: detail({ state: "RUNNING", stateReason: `hook:${eventName}` }),
          paneState,
        }),
      );
    }
    nowMs += 1_000;
    repositoryActivity.closePane(pane.paneId);

    expect(repositoryActivity.serialize().intervals).toEqual([
      expect.objectContaining({
        runId: "epoch-1:1",
        startedAt: "2026-07-10T00:00:06.000Z",
        endedAt: "2026-07-10T00:00:09.000Z",
      }),
    ]);
    expect(paneState.lastRunStartedAt).toBe("2026-07-10T00:00:06.000Z");
    expect(paneState.lastRunStartedRunId).toBe("epoch-1:1");
  });

  it("records the herdr working event that opens a run", () => {
    const paneState = createPaneStateStore().get("%1");
    paneState.agentPresence = "present";
    paneState.pendingAgentLifecycleEvents.push({
      source: "herdr",
      agentStatus: "working",
      at: "2026-07-10T00:00:06.000Z",
    });

    const commit = createCoordinator().applyObservation({
      pane,
      detail: detail({ state: "RUNNING", stateReason: "herdr:working" }),
      paneState,
    });

    expect(paneState.lastRunStartedAt).toBe("2026-07-10T00:00:06.000Z");
    expect(commit.detail.lastRunStartedAt).toBe("2026-07-10T00:00:06.000Z");
    expect(commit.activityTransitions).toEqual([
      { type: "start", epoch: "epoch-1", runSeq: 1, at: "2026-07-10T00:00:06.000Z" },
    ]);
  });

  it("preserves ordered hook begin and completion with the same timestamp", () => {
    const paneState = createPaneStateStore().get("%1");
    paneState.agentPresence = "present";
    paneState.pendingAgentLifecycleEvents.push(
      {
        source: "hook",
        agent: "codex",
        eventName: "UserPromptSubmit",
        sessionId: "session-1",
        at: "2026-07-10T00:00:01.000Z",
      },
      {
        source: "hook",
        agent: "codex",
        eventName: "Stop",
        sessionId: "session-1",
        at: "2026-07-10T00:00:01.000Z",
      },
    );

    const commit = createCoordinator().applyObservation({
      pane,
      detail: detail({ state: "WAITING_INPUT", stateReason: "hook:stop" }),
      paneState,
    });

    expect(commit.completionAdvanced).toBe(true);
    expect(commit.source).toBe("hook");
    expect(commit.detail.state).toBe("DONE");
    expect(commit.detail.completion).toMatchObject({
      completedSeq: 1,
      acknowledgedSeq: 0,
    });
    expect(paneState.completionCursor).toMatchObject({
      agentSessionId: "session-1",
      runSeq: 1,
      openRunSeq: null,
      completedSeq: 1,
      acknowledgedSeq: 0,
    });
    expect(paneState.pendingAgentLifecycleEvents).toEqual([]);
  });

  it("keeps every completion generation when multiple runs finish in one tick", () => {
    const paneState = createPaneStateStore().get("%1");
    paneState.agentPresence = "present";
    paneState.pendingAgentLifecycleEvents.push(
      {
        source: "hook",
        agent: "codex",
        eventName: "UserPromptSubmit",
        sessionId: "session-1",
        at: "2026-07-10T00:00:01.000Z",
      },
      {
        source: "hook",
        agent: "codex",
        eventName: "Stop",
        sessionId: "session-1",
        at: "2026-07-10T00:00:02.000Z",
      },
      {
        source: "hook",
        agent: "codex",
        eventName: "UserPromptSubmit",
        sessionId: "session-1",
        at: "2026-07-10T00:00:03.000Z",
      },
      {
        source: "hook",
        agent: "codex",
        eventName: "Stop",
        sessionId: "session-1",
        at: "2026-07-10T00:00:04.000Z",
      },
    );

    const commit = createCoordinator().applyObservation({
      pane,
      detail: detail({ state: "WAITING_INPUT", stateReason: "hook:stop" }),
      paneState,
    });

    expect(commit.advancedCompletions).toEqual([
      {
        epoch: "epoch-1",
        completedSeq: 1,
        source: "hook:stop",
        at: "2026-07-10T00:00:02.000Z",
      },
      {
        epoch: "epoch-1",
        completedSeq: 2,
        source: "hook:stop",
        at: "2026-07-10T00:00:04.000Z",
      },
    ]);
    expect(commit.activityTransitions).toEqual([
      { type: "start", epoch: "epoch-1", runSeq: 1, at: "2026-07-10T00:00:01.000Z" },
      { type: "complete", epoch: "epoch-1", runSeq: 1, at: "2026-07-10T00:00:02.000Z" },
      { type: "start", epoch: "epoch-1", runSeq: 2, at: "2026-07-10T00:00:03.000Z" },
      { type: "complete", epoch: "epoch-1", runSeq: 2, at: "2026-07-10T00:00:04.000Z" },
    ]);
    expect(commit.detail.completion).toMatchObject({ completedSeq: 2 });
    expect(commit.detail.lastRunStartedAt).toBe("2026-07-10T00:00:03.000Z");
  });

  it("preserves the previous session run when a new session starts in the same tick", () => {
    const paneState = createPaneStateStore().get("%1");
    paneState.agentPresence = "present";
    paneState.pendingAgentLifecycleEvents.push(
      {
        source: "hook",
        agent: "codex",
        eventName: "UserPromptSubmit",
        sessionId: "session-a",
        at: "2026-07-10T00:00:01.000Z",
      },
      {
        source: "hook",
        agent: "codex",
        eventName: "Stop",
        sessionId: "session-a",
        at: "2026-07-10T00:00:02.000Z",
      },
      {
        source: "hook",
        agent: "codex",
        eventName: "UserPromptSubmit",
        sessionId: "session-b",
        at: "2026-07-10T00:00:03.000Z",
      },
    );

    const commit = createCoordinator().applyObservation({
      pane,
      detail: detail({
        state: "RUNNING",
        stateReason: "hook:UserPromptSubmit",
        agentSessionId: "session-b",
      }),
      paneState,
    });

    expect(commit.advancedCompletions).toEqual([
      {
        epoch: "epoch-1",
        completedSeq: 1,
        source: "hook:stop",
        at: "2026-07-10T00:00:02.000Z",
      },
    ]);
    expect(commit.activityTransitions).toEqual([
      { type: "start", epoch: "epoch-1", runSeq: 1, at: "2026-07-10T00:00:01.000Z" },
      { type: "complete", epoch: "epoch-1", runSeq: 1, at: "2026-07-10T00:00:02.000Z" },
      { type: "start", epoch: "epoch-2", runSeq: 1, at: "2026-07-10T00:00:03.000Z" },
    ]);
    expect(paneState.completionCursor).toMatchObject({
      epoch: "epoch-2",
      agentSessionId: "session-b",
      openRunSeq: 1,
    });
  });

  it("acknowledges only the current epoch through the completed sequence", () => {
    const paneState = createPaneStateStore().get("%1");
    paneState.lifecycle = "WAITING_INPUT";
    paneState.completionCursor = {
      epoch: "epoch-current",
      paneInstanceKey: null,
      agent: "codex",
      agentSessionId: "session-1",
      identityConfirmedAt: "2026-07-10T00:00:00.000Z",
      agentPresent: true,
      syntheticCompletionArmed: false,
      consecutiveAbsentObservations: 0,
      runSeq: 2,
      openRunSeq: null,
      completedSeq: 2,
      acknowledgedSeq: 1,
    };
    const coordinator = createCoordinator();
    const current = detail({
      state: "DONE",
      completion: { epoch: "epoch-current", completedSeq: 2, acknowledgedSeq: 1 },
    });

    const stale = coordinator.acknowledgeView({
      detail: current,
      paneState,
      epoch: "epoch-stale",
      throughSeq: 99,
    });
    expect(stale.detail.state).toBe("DONE");
    expect(paneState.completionCursor?.acknowledgedSeq).toBe(1);

    const acknowledged = coordinator.acknowledgeView({
      detail: current,
      paneState,
      epoch: "epoch-current",
      throughSeq: 99,
    });
    expect(paneState.completionCursor?.acknowledgedSeq).toBe(2);
    expect(acknowledged.detail.state).toBe("WAITING_INPUT");
    expect(acknowledged.detail.completion).toMatchObject({ acknowledgedSeq: 2 });
  });

  it("keeps absent pending completion as DONE and projects shell after acknowledgement", () => {
    const paneState = createPaneStateStore().get("%1");
    paneState.lifecycle = "SHELL";
    paneState.completionCursor = {
      epoch: "epoch-absent",
      paneInstanceKey: null,
      agent: "claude",
      agentSessionId: "session-1",
      identityConfirmedAt: "2026-07-10T00:00:00.000Z",
      agentPresent: false,
      syntheticCompletionArmed: false,
      consecutiveAbsentObservations: 2,
      runSeq: 1,
      openRunSeq: null,
      completedSeq: 1,
      acknowledgedSeq: 0,
    };
    const coordinator = createCoordinator();
    const current = coordinator.acknowledgeView({
      detail: detail({ agent: "unknown", state: "SHELL" }),
      paneState,
      epoch: "stale",
      throughSeq: 1,
    });
    expect(current.detail).toMatchObject({
      agent: "claude",
      state: "DONE",
      completion: { epoch: "epoch-absent" },
    });

    const acknowledged = coordinator.acknowledgeView({
      detail: current.detail,
      paneState,
      epoch: "epoch-absent",
      throughSeq: 1,
    });
    expect(acknowledged.detail).toMatchObject({
      agent: "unknown",
      state: "SHELL",
      completion: null,
    });
  });

  it("restores a cursor only after current pane identity matches", () => {
    const paneState = createPaneStateStore().get("%1");
    const paneInstanceKey = createPaneInstanceKey({
      serverKey: "server",
      paneId: pane.paneId,
      panePid: pane.panePid,
    });
    paneState.pendingRestoredLifecycle = "WAITING_INPUT";
    paneState.pendingRestoredLastAgent = "codex";
    paneState.pendingRestoredCompletionCursor = {
      epoch: "persisted",
      paneInstanceKey,
      agent: "codex",
      agentSessionId: "session-1",
      identityConfirmedAt: "2026-07-10T00:00:00.000Z",
      agentPresent: true,
      syntheticCompletionArmed: false,
      consecutiveAbsentObservations: 0,
      runSeq: 1,
      openRunSeq: null,
      completedSeq: 1,
      acknowledgedSeq: 0,
    };
    paneState.agentPresence = "present";

    const commit = createCoordinator().applyObservation({
      pane,
      detail: detail({ state: "WAITING_INPUT" }),
      paneState,
    });

    expect(commit.completionAdvanced).toBe(false);
    expect(paneState.completionCursor?.epoch).toBe("persisted");
    expect(paneState.pendingRestoredCompletionCursor).toBeNull();
  });

  it("does not complete the current run from a stale identity Stop lifecycle", () => {
    const paneState = createPaneStateStore().get("%1");
    paneState.lifecycle = "RUNNING";
    paneState.agentPresence = "present";
    paneState.completionCursor = {
      epoch: "current",
      paneInstanceKey: createPaneInstanceKey({
        serverKey: "server",
        paneId: pane.paneId,
        panePid: pane.panePid,
      }),
      agent: "codex",
      agentSessionId: "session-current",
      identityConfirmedAt: "2026-07-10T00:00:01.000Z",
      agentPresent: true,
      syntheticCompletionArmed: false,
      consecutiveAbsentObservations: 0,
      runSeq: 1,
      openRunSeq: 1,
      completedSeq: 0,
      acknowledgedSeq: 0,
    };
    paneState.pendingAgentLifecycleEvents.push({
      source: "hook",
      agent: "codex",
      eventName: "Stop",
      sessionId: "session-old",
      at: "2026-07-09T23:59:59.000Z",
    });
    paneState.hookState = {
      state: "WAITING_INPUT",
      reason: "hook:stop",
      at: "2026-07-09T23:59:59.000Z",
    };

    const commit = createCoordinator().applyObservation({
      pane,
      detail: detail({ state: "WAITING_INPUT", stateReason: "hook:stop" }),
      paneState,
    });

    expect(commit.identityRejected).toBe(true);
    expect(commit.completionAdvanced).toBe(false);
    expect(commit.detail.state).toBe("RUNNING");
    expect(paneState.completionCursor).toMatchObject({ openRunSeq: 1, completedSeq: 0 });
    expect(paneState.hookState).toBeNull();
  });

  it("rejects an authoritative begin event older than the current identity", () => {
    const paneState = createPaneStateStore().get("%1");
    paneState.lifecycle = "WAITING_INPUT";
    paneState.agentPresence = "present";
    paneState.agentPresent = true;
    paneState.lastAuthoritativeEventAt = "2026-07-10T00:00:10.000Z";
    paneState.completionCursor = {
      epoch: "current",
      paneInstanceKey: createPaneInstanceKey({
        serverKey: "server",
        paneId: pane.paneId,
        panePid: pane.panePid,
      }),
      agent: "codex",
      agentSessionId: "session-1",
      identityConfirmedAt: "2026-07-10T00:00:10.000Z",
      agentPresent: true,
      syntheticCompletionArmed: false,
      consecutiveAbsentObservations: 0,
      runSeq: 1,
      openRunSeq: null,
      completedSeq: 1,
      acknowledgedSeq: 0,
    };
    paneState.pendingAgentLifecycleEvents.push({
      source: "hook",
      agent: "codex",
      eventName: "UserPromptSubmit",
      sessionId: "session-stale",
      at: "2026-07-10T00:00:05.000Z",
    });

    const commit = createCoordinator().applyObservation({
      pane,
      detail: detail({ state: "RUNNING", stateReason: "hook:UserPromptSubmit" }),
      paneState,
    });

    expect(commit.activityTransitions).toEqual([]);
    expect(commit.detail.state).toBe("DONE");
    expect(paneState.completionCursor).toMatchObject({
      epoch: "current",
      agentSessionId: "session-1",
    });
    expect(paneState.completionCursor?.openRunSeq).toBeNull();
  });

  it("does not report presence identity rejection before a newer explicit session start", () => {
    const paneState = createPaneStateStore().get("%1");
    paneState.lifecycle = "WAITING_INPUT";
    paneState.agentPresence = "present";
    paneState.agentPresent = true;
    paneState.completionCursor = {
      epoch: "epoch-old",
      paneInstanceKey: createPaneInstanceKey({
        serverKey: "server",
        paneId: pane.paneId,
        panePid: pane.panePid,
      }),
      agent: "codex",
      agentSessionId: "session-old",
      identityConfirmedAt: "2026-07-10T00:00:01.000Z",
      agentPresent: true,
      syntheticCompletionArmed: false,
      consecutiveAbsentObservations: 0,
      runSeq: 1,
      openRunSeq: null,
      completedSeq: 1,
      acknowledgedSeq: 1,
    };
    paneState.pendingAgentLifecycleEvents.push({
      source: "hook",
      agent: "codex",
      eventName: "UserPromptSubmit",
      sessionId: "session-new",
      at: "2026-07-10T00:00:02.000Z",
    });

    const commit = createCoordinator().applyObservation({
      pane,
      detail: detail({ agentSessionId: "session-new" }),
      paneState,
    });

    expect(commit.identityRejected).toBe(false);
    expect(paneState.completionCursor).toMatchObject({
      epoch: "epoch-1",
      agentSessionId: "session-new",
      identityConfirmedAt: "2026-07-10T00:00:02.000Z",
      runSeq: 1,
      openRunSeq: 1,
      completedSeq: 0,
      acknowledgedSeq: 0,
    });
  });

  it.each([
    {
      name: "agent changes",
      cursorAgent: "claude" as const,
      cursorPaneInstanceKey: createPaneInstanceKey({
        serverKey: "server",
        paneId: pane.paneId,
        panePid: pane.panePid,
      }),
    },
    {
      name: "pane instance changes",
      cursorAgent: "codex" as const,
      cursorPaneInstanceKey: "old-pane-instance",
    },
  ])(
    "binds the explicit session after the observed $name",
    ({ cursorAgent, cursorPaneInstanceKey }) => {
      const paneState = createPaneStateStore().get("%1");
      paneState.lifecycle = "WAITING_INPUT";
      paneState.agentPresence = "present";
      paneState.agentPresent = true;
      paneState.completionCursor = {
        epoch: "epoch-old",
        paneInstanceKey: cursorPaneInstanceKey,
        agent: cursorAgent,
        agentSessionId: "session-old",
        identityConfirmedAt: "2026-07-10T00:00:01.000Z",
        agentPresent: true,
        syntheticCompletionArmed: false,
        consecutiveAbsentObservations: 0,
        runSeq: 1,
        openRunSeq: null,
        completedSeq: 1,
        acknowledgedSeq: 1,
      };
      paneState.pendingAgentLifecycleEvents.push({
        source: "hook",
        agent: "codex",
        eventName: "UserPromptSubmit",
        sessionId: "session-new",
        at: "2026-07-10T00:00:02.000Z",
      });

      const commit = createCoordinator("2026-07-10T00:00:03.000Z").applyObservation({
        pane,
        detail: detail({ agent: "codex", agentSessionId: "session-new" }),
        paneState,
      });

      expect(commit.identityRejected).toBe(false);
      expect(paneState.completionCursor).toMatchObject({
        epoch: "epoch-1",
        agent: "codex",
        agentSessionId: "session-new",
        identityConfirmedAt: "2026-07-10T00:00:02.000Z",
        runSeq: 1,
        openRunSeq: 1,
        completedSeq: 0,
        acknowledgedSeq: 0,
      });
    },
  );

  it("rejects a restored cursor when pane identity mismatches", () => {
    const paneState = createPaneStateStore().get("%1");
    const paneInstanceKey = createPaneInstanceKey({
      serverKey: "server",
      paneId: pane.paneId,
      panePid: pane.panePid,
    });
    paneState.pendingRestoredLifecycle = "WAITING_INPUT";
    paneState.pendingRestoredLastAgent = "codex";
    paneState.pendingRestoredCompletionCursor = {
      epoch: "persisted",
      paneInstanceKey,
      agent: "codex",
      agentSessionId: "session-old",
      identityConfirmedAt: "2026-07-10T00:00:00.000Z",
      agentPresent: true,
      syntheticCompletionArmed: false,
      consecutiveAbsentObservations: 0,
      runSeq: 1,
      openRunSeq: null,
      completedSeq: 1,
      acknowledgedSeq: 0,
    };
    paneState.agentPresence = "present";

    createCoordinator().applyObservation({
      pane,
      detail: detail({ agentSessionId: "session-new" }),
      paneState,
    });

    expect(paneState.completionCursor?.epoch).not.toBe("persisted");
    expect(paneState.completionCursor).toMatchObject({
      agentSessionId: "session-new",
      completedSeq: 0,
      syntheticCompletionArmed: false,
    });
    expect(paneState.pendingRestoredCompletionCursor).toBeNull();
  });

  it("keeps restored DONE and its pending identity after the first successful absence", () => {
    const paneState = createPaneStateStore().get("%1");
    const paneInstanceKey = createPaneInstanceKey({
      serverKey: "server",
      paneId: pane.paneId,
      panePid: pane.panePid,
    });
    paneState.pendingRestoredLifecycle = "WAITING_INPUT";
    paneState.pendingRestoredLastAgent = "codex";
    const restoredCursor = {
      epoch: "persisted",
      paneInstanceKey,
      agent: "codex",
      agentSessionId: null,
      identityConfirmedAt: null,
      agentPresent: true,
      syntheticCompletionArmed: false,
      consecutiveAbsentObservations: 0,
      runSeq: 1,
      openRunSeq: null,
      completedSeq: 1,
      acknowledgedSeq: 0,
    } as const;
    paneState.lifecycle = "WAITING_INPUT";
    paneState.completionCursor = { ...restoredCursor };
    paneState.pendingRestoredCompletionCursor = { ...restoredCursor };
    paneState.lastResolvedAgent = "codex";
    paneState.agentPresence = "absent";
    paneState.agentPresent = true;
    paneState.consecutiveAbsentObservations = 1;

    const commit = createCoordinator().applyObservation({
      pane,
      detail: detail({ agent: "unknown", state: "UNKNOWN" }),
      paneState,
    });

    expect(commit.detail).toMatchObject({
      agent: "codex",
      state: "DONE",
      completion: { epoch: "persisted", completedSeq: 1, acknowledgedSeq: 0 },
    });
    expect(paneState.pendingRestoredCompletionCursor?.epoch).toBe("persisted");
    expect(paneState.completionCursor).toMatchObject({
      epoch: "persisted",
      agentPresent: true,
      consecutiveAbsentObservations: 1,
    });
  });

  it("keeps a restored cursor pending while projected identity presence is indeterminate", () => {
    const paneState = createPaneStateStore().get("%1");
    paneState.pendingRestoredLifecycle = "WAITING_INPUT";
    paneState.pendingRestoredLastAgent = "codex";
    const restoredCursor = {
      epoch: "persisted",
      paneInstanceKey: createPaneInstanceKey({
        serverKey: "server",
        paneId: pane.paneId,
        panePid: pane.panePid,
      }),
      agent: "codex",
      agentSessionId: "persisted-session",
      identityConfirmedAt: "2026-07-10T00:00:00.000Z",
      agentPresent: true,
      syntheticCompletionArmed: false,
      consecutiveAbsentObservations: 0,
      runSeq: 1,
      openRunSeq: null,
      completedSeq: 1,
      acknowledgedSeq: 0,
    } as const;
    paneState.lifecycle = "WAITING_INPUT";
    paneState.completionCursor = { ...restoredCursor };
    paneState.pendingRestoredCompletionCursor = { ...restoredCursor };
    paneState.lastResolvedAgent = "codex";
    paneState.agentPresent = true;
    paneState.agentPresence = "indeterminate";

    const commit = createCoordinator().applyObservation({
      pane,
      detail: detail({ agent: "codex", agentSessionId: "projected-session", state: "UNKNOWN" }),
      paneState,
    });

    expect(commit.detail.state).toBe("DONE");
    expect(paneState.completionCursor?.epoch).toBe("persisted");
    expect(paneState.pendingRestoredCompletionCursor?.epoch).toBe("persisted");
  });

  it("confirms restored absence on the second success while retaining unacknowledged DONE", () => {
    const paneState = createPaneStateStore().get("%1");
    const restoredCursor = {
      epoch: "persisted",
      paneInstanceKey: createPaneInstanceKey({
        serverKey: "server",
        paneId: pane.paneId,
        panePid: pane.panePid,
      }),
      agent: "codex",
      agentSessionId: null,
      identityConfirmedAt: null,
      agentPresent: true,
      syntheticCompletionArmed: false,
      consecutiveAbsentObservations: 1,
      runSeq: 1,
      openRunSeq: null,
      completedSeq: 1,
      acknowledgedSeq: 0,
    } as const;
    paneState.lifecycle = "WAITING_INPUT";
    paneState.completionCursor = { ...restoredCursor };
    paneState.pendingRestoredCompletionCursor = { ...restoredCursor };
    paneState.pendingRestoredLifecycle = "WAITING_INPUT";
    paneState.pendingRestoredLastAgent = "codex";
    paneState.lastResolvedAgent = "codex";
    paneState.agentPresence = "absent";
    paneState.agentPresent = false;
    paneState.consecutiveAbsentObservations = 2;

    const commit = createCoordinator().applyObservation({
      pane,
      detail: detail({ agent: "unknown", state: "UNKNOWN" }),
      paneState,
    });

    expect(commit.confirmedAbsent).toBe(true);
    expect(commit.advancedCompletions).toEqual([]);
    expect(commit.activityTransitions).toEqual([]);
    expect(commit.detail).toMatchObject({
      agent: "codex",
      state: "DONE",
      completion: { epoch: "persisted", completedSeq: 1, acknowledgedSeq: 0 },
    });
    expect(paneState.completionCursor).toMatchObject({
      agentPresent: false,
      consecutiveAbsentObservations: 2,
    });
    expect(paneState.pendingRestoredCompletionCursor).toBeNull();
  });

  it("preserves queued begin and completion intents after confirmed absence", () => {
    const paneState = createPaneStateStore().get("%1");
    paneState.lifecycle = "WAITING_INPUT";
    paneState.agentPresence = "absent";
    paneState.agentPresent = false;
    paneState.consecutiveAbsentObservations = 2;
    paneState.lastResolvedAgent = "codex";
    paneState.completionCursor = {
      epoch: "current",
      paneInstanceKey: createPaneInstanceKey({
        serverKey: "server",
        paneId: pane.paneId,
        panePid: pane.panePid,
      }),
      agent: "codex",
      agentSessionId: "session-1",
      identityConfirmedAt: "2026-07-10T00:00:00.000Z",
      agentPresent: true,
      syntheticCompletionArmed: false,
      consecutiveAbsentObservations: 1,
      runSeq: 0,
      openRunSeq: null,
      completedSeq: 0,
      acknowledgedSeq: 0,
    };
    paneState.pendingAgentLifecycleEvents.push(
      {
        source: "hook",
        agent: "codex",
        eventName: "UserPromptSubmit",
        sessionId: "session-1",
        at: "2026-07-10T00:00:01.000Z",
      },
      {
        source: "hook",
        agent: "codex",
        eventName: "Stop",
        sessionId: "session-1",
        at: "2026-07-10T00:00:02.000Z",
      },
    );

    const commit = createCoordinator().applyObservation({
      pane,
      detail: detail({ agent: "unknown", state: "UNKNOWN", stateReason: "hook:stop" }),
      paneState,
    });

    expect(commit.completionAdvanced).toBe(true);
    expect(commit.advancedCompletions).toEqual([
      {
        epoch: "epoch-1",
        completedSeq: 1,
        source: "hook:stop",
        at: "2026-07-10T00:00:02.000Z",
      },
    ]);
    expect(commit.activityTransitions).toEqual([
      { type: "start", epoch: "epoch-1", runSeq: 1, at: "2026-07-10T00:00:01.000Z" },
      { type: "complete", epoch: "epoch-1", runSeq: 1, at: "2026-07-10T00:00:02.000Z" },
    ]);
    expect(commit.detail.state).toBe("DONE");
    expect(paneState.completionCursor).toMatchObject({
      agentPresent: true,
      runSeq: 1,
      openRunSeq: null,
      completedSeq: 1,
    });
  });
});
