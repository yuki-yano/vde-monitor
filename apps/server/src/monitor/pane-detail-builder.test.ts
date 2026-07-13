import type { PaneMeta } from "@vde-monitor/multiplexer";
import { describe, expect, it } from "vitest";

import type { PaneResolvedContext } from "./pane-context-resolver";
import { buildPaneDetail } from "./pane-detail-builder";
import type { PaneObservation } from "./pane-observation";

const pane: PaneMeta = {
  paneId: "%1",
  sessionId: "$1",
  sessionName: "main",
  windowId: "@0",
  windowIndex: 0,
  paneIndex: 1,
  windowActivity: null,
  paneActivity: null,
  paneActive: true,
  currentCommand: "bash",
  currentPath: "/tmp/project",
  paneTty: "/dev/ttys001",
  paneDead: false,
  panePipe: false,
  alternateOn: false,
  panePid: 123,
  paneTitle: "pane",
  paneStartCommand: "bash",
  pipeTagValue: "0",
};

const observation: PaneObservation = {
  agent: "codex",
  pipeAttached: true,
  pipeConflict: false,
  paneState: {
    lifecycle: "RUNNING",
    completionCursor: null,
    pendingRestoredCompletionCursor: null,
    pendingRestoredLifecycle: null,
    pendingRestoredLastAgent: null,
    lastResolvedAgent: "codex",
    agentPresence: "present",
    agentPresent: true,
    consecutiveAbsentObservations: 0,
    lastResolvedState: "RUNNING",
    lastResolvedStateReason: "estimated",
    pendingAgentLifecycleEvents: [],
    lastAuthoritativeEventAt: null,
    hookState: null,
    codexQuestionPromptActive: false,
    lastOutputAt: null,
    lastEventAt: "2024-01-01T00:00:00.000Z",
    lastMessage: "message",
    lastInputAt: "2024-01-01T00:01:00.000Z",
    agentSessionId: null,
    agentSessionSource: null,
    agentSessionConfidence: null,
    agentSessionObservedAt: null,
    externalInputCursorBytes: null,
    externalInputSignature: null,
    externalInputLastDetectedAt: null,
    externalInputLastCheckedAt: null,
    externalInputLastReason: null,
    externalInputLastReasonCode: null,
    externalInputLastErrorMessage: null,
    lastFingerprint: null,
    lastFingerprintCaptureAtMs: null,
  },
  outputAt: "2024-01-01T00:02:00.000Z",
  finalState: {
    state: "RUNNING",
    reason: "estimated",
  },
  agentPresence: "present",
  confirmedAgentAbsent: false,
  agentBecameAbsent: false,
};

const paneContext: PaneResolvedContext = {
  repoRoot: "/tmp/project",
  branch: "feature/worktree",
  worktreePath: "/tmp/project/.worktree/feature/worktree",
  worktreeDirty: true,
  worktreeLocked: false,
  worktreeLockOwner: null,
  worktreeLockReason: null,
  worktreeMerged: false,
};

describe("buildPaneDetail", () => {
  it("builds session detail from observation and resolved context", () => {
    const detail = buildPaneDetail({
      pane,
      observation,
      paneContext,
      customTitle: "Custom",
    });

    expect(detail.paneId).toBe("%1");
    expect(detail.sessionId).toBe("$1");
    expect(detail.windowId).toBe("@0");
    expect(detail.agent).toBe("codex");
    expect(detail.state).toBe("RUNNING");
    expect(detail.stateReason).toBe("estimated");
    expect(detail.lastMessage).toBe("message");
    expect(detail.lastOutputAt).toBe("2024-01-01T00:02:00.000Z");
    expect(detail.lastInputAt).toBe("2024-01-01T00:01:00.000Z");
    expect(detail.customTitle).toBe("Custom");
    expect(detail.repoRoot).toBe("/tmp/project");
    expect(detail.branch).toBe("feature/worktree");
  });
});
