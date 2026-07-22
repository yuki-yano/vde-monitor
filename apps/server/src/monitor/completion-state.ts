import { randomUUID } from "node:crypto";

import type { AgentLifecycle } from "@vde-monitor/multiplexer";

export type { AgentLifecycle } from "@vde-monitor/multiplexer";

export type PublicPaneState = AgentLifecycle | "DONE";
export type CompletionAgent = "codex" | "claude";
export type AgentPresence = "present" | "absent" | "indeterminate";

export type CompletionCursor = {
  epoch: string;
  paneInstanceKey: string | null;
  agent: CompletionAgent;
  agentSessionId: string | null;
  identityConfirmedAt: string | null;
  agentPresent: boolean;
  syntheticCompletionArmed: boolean;
  consecutiveAbsentObservations: number;
  runSeq: number;
  openRunSeq: number | null;
  completedSeq: number;
  acknowledgedSeq: number;
};

export type CompletionState = {
  lifecycle: AgentLifecycle;
  cursor: CompletionCursor | null;
};

export type AgentIdentity = {
  agent: CompletionAgent;
  agentSessionId: string | null;
  paneInstanceKey: string | null;
};

export type ObserveAgentIdentityEvent = AgentIdentity & {
  type: "observe-agent-identity";
  origin: "presence" | "explicit-session-start" | "event";
  at?: string;
  armSyntheticCompletion?: boolean;
};

export type ResetAgentEpochEvent = AgentIdentity & {
  type: "reset-agent-epoch";
  at?: string;
  agentPresent?: boolean;
  syntheticCompletionArmed?: boolean;
};

export type BeginRunEvent = {
  type: "begin-run";
  at?: string;
  source: string;
  lifecycle?: AgentLifecycle;
};

export type CompletionSource = "hook:stop" | "herdr:done" | "poll" | "confirmed-absent";

export type CompleteRunEvent = {
  type: "complete-run";
  at?: string;
  source: CompletionSource;
  agent?: CompletionAgent;
  agentSessionId?: string | null;
  lifecycle?: AgentLifecycle;
};

export type ObservePresenceEvent = {
  type: "observe-presence";
  presence: AgentPresence;
  at?: string;
  lifecycleWhenAbsent?: "SHELL" | "UNKNOWN";
  lifecycleWhenPresent?: AgentLifecycle;
};

export type AcknowledgeViewEvent = {
  type: "acknowledge-view";
  epoch: string;
  throughSeq: number;
  at?: string;
};

export type SetLifecycleEvent = {
  type: "set-lifecycle";
  lifecycle: AgentLifecycle;
  at?: string;
};

export type CompletionStateEvent =
  | ObserveAgentIdentityEvent
  | ResetAgentEpochEvent
  | BeginRunEvent
  | CompleteRunEvent
  | ObservePresenceEvent
  | AcknowledgeViewEvent
  | SetLifecycleEvent;

export type CompletionReduction = {
  state: CompletionState;
  completionAdvanced: boolean;
  epochChanged: boolean;
  identityRejected: boolean;
  acknowledgementApplied: boolean;
  confirmedAbsent: boolean;
};

export type CompletionStateReducerOptions = {
  createEpoch?: () => string;
  now?: () => string;
};

const isSafeSequence = (value: number) => Number.isSafeInteger(value) && value >= 0;

const parseTimestamp = (value: string | null | undefined): number | null => {
  if (value == null) {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
};

const normalizeTimestamp = (value: string | undefined, fallback: () => string): string | null => {
  if (parseTimestamp(value) != null) {
    return value ?? null;
  }
  const fallbackValue = fallback();
  return parseTimestamp(fallbackValue) == null ? null : fallbackValue;
};

const cloneState = (state: CompletionState): CompletionState => ({
  lifecycle: state.lifecycle,
  cursor: state.cursor == null ? null : { ...state.cursor },
});

const unchanged = (state: CompletionState): CompletionReduction => ({
  state,
  completionAdvanced: false,
  epochChanged: false,
  identityRejected: false,
  acknowledgementApplied: false,
  confirmedAbsent: false,
});

const withFlags = (
  state: CompletionState,
  flags: Partial<Omit<CompletionReduction, "state">> = {},
): CompletionReduction => ({
  state,
  completionAdvanced: flags.completionAdvanced ?? false,
  epochChanged: flags.epochChanged ?? false,
  identityRejected: flags.identityRejected ?? false,
  acknowledgementApplied: flags.acknowledgementApplied ?? false,
  confirmedAbsent: flags.confirmedAbsent ?? false,
});

export const createInitialCompletionState = (
  lifecycle: AgentLifecycle = "UNKNOWN",
): CompletionState => ({
  lifecycle,
  cursor: null,
});

export const getCompletionInvariantViolations = (cursor: CompletionCursor): string[] => {
  const violations: string[] = [];
  if (!cursor.epoch) {
    violations.push("epoch must not be empty");
  }
  if (
    !isSafeSequence(cursor.acknowledgedSeq) ||
    !isSafeSequence(cursor.completedSeq) ||
    !isSafeSequence(cursor.runSeq)
  ) {
    violations.push("sequences must be non-negative safe integers");
  }
  if (cursor.acknowledgedSeq > cursor.completedSeq) {
    violations.push("acknowledgedSeq must not exceed completedSeq");
  }
  if (cursor.completedSeq > cursor.runSeq) {
    violations.push("completedSeq must not exceed runSeq");
  }
  if (cursor.openRunSeq != null && cursor.openRunSeq !== cursor.runSeq) {
    violations.push("openRunSeq must be null or equal runSeq");
  }
  if (cursor.syntheticCompletionArmed) {
    if (cursor.runSeq !== 0 || cursor.openRunSeq != null || cursor.completedSeq !== 0) {
      violations.push("an armed cursor must not contain a run or completion");
    }
  }
  if (
    !Number.isSafeInteger(cursor.consecutiveAbsentObservations) ||
    cursor.consecutiveAbsentObservations < 0
  ) {
    violations.push("consecutiveAbsentObservations must be a non-negative safe integer");
  }
  if (cursor.identityConfirmedAt != null && parseTimestamp(cursor.identityConfirmedAt) == null) {
    violations.push("identityConfirmedAt must be a parseable timestamp or null");
  }
  return violations;
};

export const assertCompletionCursorInvariant = (cursor: CompletionCursor): void => {
  const violations = getCompletionInvariantViolations(cursor);
  if (violations.length > 0) {
    throw new Error(`invalid completion cursor: ${violations.join("; ")}`);
  }
};

export const hasUnacknowledgedCompletion = (cursor: CompletionCursor | null): boolean =>
  cursor != null && cursor.completedSeq > cursor.acknowledgedSeq;

export const resolvePublicPaneState = ({ lifecycle, cursor }: CompletionState): PublicPaneState => {
  if (lifecycle === "WAITING_PERMISSION") {
    return "WAITING_PERMISSION";
  }
  if (lifecycle === "RUNNING") {
    return "RUNNING";
  }
  if (hasUnacknowledgedCompletion(cursor) && lifecycle === "WAITING_INPUT") {
    return "DONE";
  }
  if (lifecycle === "WAITING_INPUT") {
    return "WAITING_INPUT";
  }
  if (lifecycle === "SHELL") {
    return "SHELL";
  }
  return "UNKNOWN";
};

export const canRestoreCompletionCursor = (
  persisted: CompletionCursor,
  current: AgentIdentity,
): boolean => {
  if (persisted.agent !== current.agent) {
    return false;
  }
  if (
    persisted.agentSessionId != null &&
    current.agentSessionId != null &&
    persisted.agentSessionId === current.agentSessionId
  ) {
    return true;
  }
  if (
    persisted.paneInstanceKey == null ||
    current.paneInstanceKey == null ||
    persisted.paneInstanceKey !== current.paneInstanceKey
  ) {
    return false;
  }
  return !(
    persisted.agentSessionId != null &&
    current.agentSessionId != null &&
    persisted.agentSessionId !== current.agentSessionId
  );
};

export const isAuthoritativeCompletionSource = (source: CompletionSource): boolean =>
  source === "hook:stop" || source === "herdr:done";

export const createCompletionStateReducer = (options: CompletionStateReducerOptions = {}) => {
  const createEpoch = options.createEpoch ?? randomUUID;
  const now = options.now ?? (() => new Date().toISOString());

  const createCursor = ({
    agent,
    agentSessionId,
    paneInstanceKey,
    at,
    agentPresent = true,
    syntheticCompletionArmed = false,
  }: AgentIdentity & {
    at?: string;
    agentPresent?: boolean;
    syntheticCompletionArmed?: boolean;
  }): CompletionCursor => {
    const cursor: CompletionCursor = {
      epoch: createEpoch(),
      paneInstanceKey,
      agent,
      agentSessionId,
      identityConfirmedAt: normalizeTimestamp(at, now),
      agentPresent,
      syntheticCompletionArmed,
      consecutiveAbsentObservations: 0,
      runSeq: 0,
      openRunSeq: null,
      completedSeq: 0,
      acknowledgedSeq: 0,
    };
    assertCompletionCursorInvariant(cursor);
    return cursor;
  };

  const resetAgentEpoch = (
    state: CompletionState,
    event: ResetAgentEpochEvent,
  ): CompletionReduction => {
    const next = cloneState(state);
    next.cursor = createCursor({
      agent: event.agent,
      agentSessionId: event.agentSessionId,
      paneInstanceKey: event.paneInstanceKey,
      at: event.at,
      agentPresent: event.agentPresent ?? true,
      syntheticCompletionArmed: event.syntheticCompletionArmed ?? false,
    });
    return withFlags(next, { epochChanged: true });
  };

  const rejectIdentity = (state: CompletionState): CompletionReduction =>
    withFlags(state, { identityRejected: true });

  const observeAgentIdentity = (
    state: CompletionState,
    event: ObserveAgentIdentityEvent,
  ): CompletionReduction => {
    const cursor = state.cursor;
    const eventAtMs = parseTimestamp(event.at);

    if (cursor == null) {
      if (event.origin === "event") {
        return rejectIdentity(state);
      }
      if (event.origin === "explicit-session-start" && eventAtMs == null) {
        return rejectIdentity(state);
      }
      return resetAgentEpoch(state, {
        type: "reset-agent-epoch",
        agent: event.agent,
        agentSessionId: event.agentSessionId,
        paneInstanceKey: event.paneInstanceKey,
        at:
          event.origin === "presence" ? (normalizeTimestamp(event.at, now) ?? undefined) : event.at,
        syntheticCompletionArmed:
          event.origin === "presence" && event.armSyntheticCompletion === true,
      });
    }

    const differentAgent = cursor.agent !== event.agent;
    const differentPaneInstance =
      cursor.paneInstanceKey != null &&
      event.paneInstanceKey != null &&
      cursor.paneInstanceKey !== event.paneInstanceKey;

    if (differentAgent || differentPaneInstance) {
      if (event.origin === "presence") {
        return resetAgentEpoch(state, {
          type: "reset-agent-epoch",
          agent: event.agent,
          agentSessionId: event.agentSessionId,
          paneInstanceKey: event.paneInstanceKey,
          at: normalizeTimestamp(event.at, now) ?? undefined,
          syntheticCompletionArmed: event.armSyntheticCompletion === true,
        });
      }
      if (event.origin !== "explicit-session-start" || eventAtMs == null) {
        return rejectIdentity(state);
      }
      const confirmedAtMs = parseTimestamp(cursor.identityConfirmedAt);
      if (confirmedAtMs != null && eventAtMs <= confirmedAtMs) {
        return rejectIdentity(state);
      }
      return resetAgentEpoch(state, {
        type: "reset-agent-epoch",
        agent: event.agent,
        agentSessionId: event.agentSessionId,
        paneInstanceKey: event.paneInstanceKey,
        at: event.at,
        syntheticCompletionArmed: false,
      });
    }

    const next = cloneState(state);
    const nextCursor = next.cursor;
    if (nextCursor == null) {
      return unchanged(state);
    }
    if (nextCursor.paneInstanceKey == null && event.paneInstanceKey != null) {
      nextCursor.paneInstanceKey = event.paneInstanceKey;
    }

    if (event.agentSessionId == null) {
      return withFlags(next);
    }

    if (event.agentSessionId === nextCursor.agentSessionId) {
      const confirmedAtMs = parseTimestamp(nextCursor.identityConfirmedAt);
      if (eventAtMs != null && (confirmedAtMs == null || eventAtMs > confirmedAtMs)) {
        nextCursor.identityConfirmedAt = event.at ?? null;
      }
      assertCompletionCursorInvariant(nextCursor);
      return withFlags(next);
    }

    if (nextCursor.agentSessionId == null) {
      nextCursor.agentSessionId = event.agentSessionId;
      nextCursor.identityConfirmedAt = normalizeTimestamp(event.at, now);
      assertCompletionCursorInvariant(nextCursor);
      return withFlags(next);
    }

    if (event.origin !== "explicit-session-start" || eventAtMs == null) {
      return rejectIdentity(state);
    }
    const confirmedAtMs = parseTimestamp(nextCursor.identityConfirmedAt);
    if (confirmedAtMs != null && eventAtMs <= confirmedAtMs) {
      return rejectIdentity(state);
    }
    return resetAgentEpoch(state, {
      type: "reset-agent-epoch",
      agent: event.agent,
      agentSessionId: event.agentSessionId,
      paneInstanceKey: event.paneInstanceKey,
      at: event.at,
      syntheticCompletionArmed: false,
    });
  };

  const beginRun = (state: CompletionState, event: BeginRunEvent): CompletionReduction => {
    const next = cloneState(state);
    next.lifecycle = event.lifecycle ?? "RUNNING";
    const cursor = next.cursor;
    if (cursor == null || cursor.openRunSeq != null || !cursor.agentPresent) {
      return withFlags(next);
    }
    cursor.runSeq += 1;
    cursor.openRunSeq = cursor.runSeq;
    cursor.syntheticCompletionArmed = false;
    assertCompletionCursorInvariant(cursor);
    return withFlags(next);
  };

  const hasMatchingCompletionIdentity = (
    cursor: CompletionCursor,
    event: CompleteRunEvent,
  ): boolean => {
    if (event.agent != null && event.agent !== cursor.agent) {
      return false;
    }
    return !(
      event.agentSessionId != null &&
      cursor.agentSessionId != null &&
      event.agentSessionId !== cursor.agentSessionId
    );
  };

  const bindCompletionIdentity = (cursor: CompletionCursor, event: CompleteRunEvent): void => {
    if (
      cursor.agentSessionId == null &&
      event.agentSessionId != null &&
      (event.agent == null || event.agent === cursor.agent)
    ) {
      cursor.agentSessionId = event.agentSessionId;
      if (parseTimestamp(event.at) != null) {
        cursor.identityConfirmedAt = event.at ?? null;
      }
    }
  };

  const completeRun = (state: CompletionState, event: CompleteRunEvent): CompletionReduction => {
    const cursor = state.cursor;
    if (cursor != null && !hasMatchingCompletionIdentity(cursor, event)) {
      return withFlags(state, { identityRejected: true });
    }

    const next = cloneState(state);
    next.lifecycle = event.lifecycle ?? "WAITING_INPUT";
    const nextCursor = next.cursor;
    if (nextCursor == null) {
      return withFlags(next);
    }

    bindCompletionIdentity(nextCursor, event);
    if (nextCursor.openRunSeq != null) {
      nextCursor.completedSeq = Math.max(nextCursor.completedSeq, nextCursor.openRunSeq);
      nextCursor.openRunSeq = null;
      assertCompletionCursorInvariant(nextCursor);
      return withFlags(next, { completionAdvanced: true });
    }

    if (
      nextCursor.syntheticCompletionArmed &&
      nextCursor.runSeq === 0 &&
      isAuthoritativeCompletionSource(event.source)
    ) {
      nextCursor.runSeq = 1;
      nextCursor.completedSeq = 1;
      nextCursor.openRunSeq = null;
      nextCursor.syntheticCompletionArmed = false;
      assertCompletionCursorInvariant(nextCursor);
      return withFlags(next, { completionAdvanced: true });
    }

    assertCompletionCursorInvariant(nextCursor);
    return withFlags(next);
  };

  const observePresence = (
    state: CompletionState,
    event: ObservePresenceEvent,
  ): CompletionReduction => {
    const cursor = state.cursor;
    if (cursor == null || event.presence === "indeterminate") {
      return unchanged(state);
    }

    if (event.presence === "present") {
      if (!cursor.agentPresent) {
        const reset = resetAgentEpoch(state, {
          type: "reset-agent-epoch",
          agent: cursor.agent,
          agentSessionId: cursor.agentSessionId,
          paneInstanceKey: cursor.paneInstanceKey,
          at: normalizeTimestamp(event.at, now) ?? undefined,
          agentPresent: true,
          syntheticCompletionArmed: false,
        });
        reset.state.lifecycle = event.lifecycleWhenPresent ?? state.lifecycle;
        return reset;
      }
      const next = cloneState(state);
      if (next.cursor != null) {
        next.cursor.consecutiveAbsentObservations = 0;
      }
      next.lifecycle = event.lifecycleWhenPresent ?? state.lifecycle;
      return withFlags(next);
    }

    if (!cursor.agentPresent) {
      return unchanged(state);
    }

    const next = cloneState(state);
    const nextCursor = next.cursor;
    if (nextCursor == null) {
      return unchanged(state);
    }
    nextCursor.consecutiveAbsentObservations = Math.min(
      2,
      nextCursor.consecutiveAbsentObservations + 1,
    );
    if (nextCursor.consecutiveAbsentObservations < 2) {
      assertCompletionCursorInvariant(nextCursor);
      return withFlags(next);
    }

    let completionAdvanced = false;
    if (nextCursor.openRunSeq != null) {
      nextCursor.completedSeq = Math.max(nextCursor.completedSeq, nextCursor.openRunSeq);
      nextCursor.openRunSeq = null;
      completionAdvanced = true;
    }
    nextCursor.agentPresent = false;
    nextCursor.syntheticCompletionArmed = false;
    next.lifecycle = event.lifecycleWhenAbsent ?? "UNKNOWN";
    assertCompletionCursorInvariant(nextCursor);
    return withFlags(next, {
      completionAdvanced,
      confirmedAbsent: true,
    });
  };

  const acknowledgeView = (
    state: CompletionState,
    event: AcknowledgeViewEvent,
  ): CompletionReduction => {
    const cursor = state.cursor;
    if (cursor == null || cursor.epoch !== event.epoch || !isSafeSequence(event.throughSeq)) {
      return unchanged(state);
    }
    const acknowledgedSeq = Math.max(
      cursor.acknowledgedSeq,
      Math.min(event.throughSeq, cursor.completedSeq),
    );
    if (acknowledgedSeq === cursor.acknowledgedSeq) {
      return unchanged(state);
    }
    const next = cloneState(state);
    if (next.cursor != null) {
      next.cursor.acknowledgedSeq = acknowledgedSeq;
      assertCompletionCursorInvariant(next.cursor);
    }
    return withFlags(next, { acknowledgementApplied: true });
  };

  const setLifecycle = (state: CompletionState, event: SetLifecycleEvent): CompletionReduction => {
    if (state.lifecycle === event.lifecycle) {
      return unchanged(state);
    }
    return withFlags({ ...state, lifecycle: event.lifecycle });
  };

  const reduce = (state: CompletionState, event: CompletionStateEvent): CompletionReduction => {
    switch (event.type) {
      case "observe-agent-identity":
        return observeAgentIdentity(state, event);
      case "reset-agent-epoch":
        return resetAgentEpoch(state, event);
      case "begin-run":
        return beginRun(state, event);
      case "complete-run":
        return completeRun(state, event);
      case "observe-presence":
        return observePresence(state, event);
      case "acknowledge-view":
        return acknowledgeView(state, event);
      case "set-lifecycle":
        return setLifecycle(state, event);
    }
  };

  return {
    createCursor,
    reduce,
    resetAgentEpoch,
    observeAgentIdentity,
    beginRun,
    completeRun,
    observePresence,
    acknowledgeView,
    setLifecycle,
  };
};
