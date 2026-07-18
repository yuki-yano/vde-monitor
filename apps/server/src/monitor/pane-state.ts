import type { HerdrAgentStatusSignal, HookStateSignal } from "@vde-monitor/multiplexer";
import type { SessionStateValue } from "@vde-monitor/shared";

import type { AgentType } from "./agent-resolver-utils";
import type { AgentLifecycle, CompletionCursor } from "./completion-state";
import type {
  ExternalInputDetectReason,
  ExternalInputDetectReasonCode,
} from "./external-input-detector";

export type PendingAgentLifecycleEvent =
  | {
      source: "hook";
      agent: "claude" | "codex";
      eventName:
        | "PreToolUse"
        | "PostToolUse"
        | "Notification"
        | "PermissionRequest"
        | "Stop"
        | "UserPromptSubmit";
      sessionId: string;
      at: string;
    }
  | {
      source: "herdr";
      agentStatus: "working" | "blocked" | "done" | "idle";
      at: string;
    };

export type PaneRuntimeState = {
  lifecycle: AgentLifecycle;
  completionCursor: CompletionCursor | null;
  pendingRestoredCompletionCursor: CompletionCursor | null;
  pendingRestoredLifecycle: AgentLifecycle | null;
  pendingRestoredLastAgent: AgentType | null;
  lastResolvedAgent: AgentType;
  agentPresence: "present" | "absent" | "indeterminate";
  agentPresent: boolean;
  candidateAgent: Exclude<AgentType, "unknown"> | null;
  candidateAgentPresentObservations: number;
  consecutiveAbsentObservations: number;
  lastResolvedState: SessionStateValue | null;
  lastResolvedStateReason: string | null;
  pendingAgentLifecycleEvents: PendingAgentLifecycleEvent[];
  lastAuthoritativeEventAt: string | null;
  hookState: HookStateSignal | null;
  herdrAgentStatus?: HerdrAgentStatusSignal | null;
  codexQuestionPromptActive: boolean;
  lastOutputAt: string | null;
  lastEventAt: string | null;
  lastMessage: string | null;
  lastInputAt: string | null;
  lastRunStartedAt: string | null;
  manualSortAt: string | null;
  agentSessionId: string | null;
  agentSessionSource: "hook" | "lsof" | "history" | null;
  agentSessionConfidence: "high" | "medium" | "low" | null;
  agentSessionObservedAt: string | null;
  externalInputCursorBytes: number | null;
  externalInputSignature: string | null;
  externalInputLastDetectedAt: string | null;
  externalInputLastCheckedAt: string | null;
  externalInputLastReason: ExternalInputDetectReason | null;
  externalInputLastReasonCode: ExternalInputDetectReasonCode | null;
  externalInputLastErrorMessage: string | null;
  lastFingerprint: string | null;
  lastFingerprintCaptureAtMs: number | null;
};

const createDefaultState = (): PaneRuntimeState => ({
  lifecycle: "UNKNOWN",
  completionCursor: null,
  pendingRestoredCompletionCursor: null,
  pendingRestoredLifecycle: null,
  pendingRestoredLastAgent: null,
  lastResolvedAgent: "unknown",
  agentPresence: "indeterminate",
  agentPresent: false,
  candidateAgent: null,
  candidateAgentPresentObservations: 0,
  consecutiveAbsentObservations: 0,
  lastResolvedState: null,
  lastResolvedStateReason: null,
  pendingAgentLifecycleEvents: [],
  lastAuthoritativeEventAt: null,
  hookState: null,
  herdrAgentStatus: null,
  codexQuestionPromptActive: false,
  lastOutputAt: null,
  lastEventAt: null,
  lastMessage: null,
  lastInputAt: null,
  lastRunStartedAt: null,
  manualSortAt: null,
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
});

export const createPaneStateStore = () => {
  const store = new Map<string, PaneRuntimeState>();

  const get = (paneId: string) => {
    let state = store.get(paneId);
    if (!state) {
      state = createDefaultState();
      store.set(paneId, state);
    }
    return state;
  };

  const remove = (paneId: string) => {
    store.delete(paneId);
  };

  const pruneMissing = (activePaneIds: Set<string>) => {
    store.forEach((_state, paneId) => {
      if (!activePaneIds.has(paneId)) {
        store.delete(paneId);
      }
    });
  };

  return { get, remove, pruneMissing };
};

export const updateOutputAt = (state: PaneRuntimeState, next: string | null) => {
  if (!next) {
    return state.lastOutputAt;
  }
  const nextTs = Date.parse(next);
  if (Number.isNaN(nextTs)) {
    return state.lastOutputAt;
  }
  const prevTs = state.lastOutputAt ? Date.parse(state.lastOutputAt) : null;
  if (!prevTs || Number.isNaN(prevTs) || nextTs > prevTs) {
    state.lastOutputAt = new Date(nextTs).toISOString();
  }
  return state.lastOutputAt;
};

export const updateInputAt = (state: PaneRuntimeState, next: string | null) => {
  if (!next) {
    return state.lastInputAt;
  }
  const nextTs = Date.parse(next);
  if (Number.isNaN(nextTs)) {
    return state.lastInputAt;
  }
  const prevTs = state.lastInputAt ? Date.parse(state.lastInputAt) : null;
  if (!prevTs || Number.isNaN(prevTs) || nextTs > prevTs) {
    state.lastInputAt = new Date(nextTs).toISOString();
  }
  return state.lastInputAt;
};

const updateTimestamp = (
  current: string | null,
  next: string | null,
  assign: (value: string) => void,
) => {
  if (!next) {
    return current;
  }
  const nextTs = Date.parse(next);
  if (Number.isNaN(nextTs)) {
    return current;
  }
  const prevTs = current ? Date.parse(current) : null;
  if (!prevTs || Number.isNaN(prevTs) || nextTs > prevTs) {
    const normalized = new Date(nextTs).toISOString();
    assign(normalized);
    return normalized;
  }
  return current;
};

export const updateRunStartedAt = (state: PaneRuntimeState, next: string | null) =>
  updateTimestamp(state.lastRunStartedAt, next, (value) => {
    state.lastRunStartedAt = value;
  });

export const updateManualSortAt = (state: PaneRuntimeState, next: string | null) =>
  updateTimestamp(state.manualSortAt, next, (value) => {
    state.manualSortAt = value;
  });
