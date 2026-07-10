import { createHash } from "node:crypto";

import type { PaneMeta } from "@vde-monitor/multiplexer";
import type { SessionDetail, SessionStateTimelineSource } from "@vde-monitor/shared";

import type { AgentType } from "./agent-resolver-utils";
import {
  type AgentIdentity,
  type AgentLifecycle,
  type CompletionAgent,
  type CompletionReduction,
  type CompletionState,
  canRestoreCompletionCursor,
  createCompletionStateReducer,
  hasUnacknowledgedCompletion,
  resolvePublicPaneState,
} from "./completion-state";
import type { PaneRuntimeState, PendingAgentLifecycleEvent } from "./pane-state";

export type PaneCompletionCommit = {
  detail: SessionDetail;
  completionAdvanced: boolean;
  completionEpoch: string | null;
  completedSeq: number | null;
  source: SessionStateTimelineSource;
  identityRejected: boolean;
  confirmedAbsent: boolean;
  advancedCompletions: Array<{ epoch: string; completedSeq: number }>;
};

const toCompletionAgent = (agent: AgentType): CompletionAgent | null =>
  agent === "codex" || agent === "claude" ? agent : null;

const toAgentLifecycle = (state: SessionDetail["state"]): AgentLifecycle => {
  if (state === "DONE") {
    throw new Error("DONE must not enter the canonical lifecycle reducer");
  }
  return state;
};

export const createPaneInstanceKey = ({
  serverKey,
  paneId,
  panePid,
}: {
  serverKey: string;
  paneId: string;
  panePid: number | null;
}) => {
  if (panePid == null) {
    return null;
  }
  return createHash("sha256")
    .update(serverKey)
    .update("\0")
    .update(paneId)
    .update("\0")
    .update(String(panePid))
    .digest("hex");
};

const mergeReduction = (
  aggregate: Omit<PaneCompletionCommit, "detail" | "source">,
  reduction: CompletionReduction,
) => {
  const nextCompletion =
    reduction.completionAdvanced && reduction.state.cursor != null
      ? {
          epoch: reduction.state.cursor.epoch,
          completedSeq: reduction.state.cursor.completedSeq,
        }
      : null;
  const advancedCompletions =
    nextCompletion == null ||
    aggregate.advancedCompletions.some(
      ({ epoch, completedSeq }) =>
        epoch === nextCompletion.epoch && completedSeq === nextCompletion.completedSeq,
    )
      ? aggregate.advancedCompletions
      : [...aggregate.advancedCompletions, nextCompletion];
  return {
    completionAdvanced: aggregate.completionAdvanced || reduction.completionAdvanced,
    completionEpoch: reduction.state.cursor?.epoch ?? aggregate.completionEpoch,
    completedSeq: reduction.state.cursor?.completedSeq ?? aggregate.completedSeq,
    identityRejected: aggregate.identityRejected || reduction.identityRejected,
    confirmedAbsent: aggregate.confirmedAbsent || reduction.confirmedAbsent,
    advancedCompletions,
  };
};

const resolveEventSource = (events: PendingAgentLifecycleEvent[]): SessionStateTimelineSource =>
  events.some(({ source }) => source === "hook") ? "hook" : "poll";

const projectPublicDetail = (detail: SessionDetail, state: CompletionState): SessionDetail => {
  const cursor = state.cursor;
  if (cursor == null) {
    return { ...detail, state: state.lifecycle, completion: null };
  }
  const pending = hasUnacknowledgedCompletion(cursor);
  const completion =
    cursor.agentPresent || pending
      ? {
          epoch: cursor.epoch,
          completedSeq: cursor.completedSeq,
          acknowledgedSeq: cursor.acknowledgedSeq,
        }
      : null;
  return {
    ...detail,
    agent: cursor.agentPresent || pending ? cursor.agent : "unknown",
    completion,
    state: resolvePublicPaneState(state),
    agentSessionId: cursor.agentSessionId ?? detail.agentSessionId,
    agentSessionSource: cursor.agentSessionId == null ? detail.agentSessionSource : "hook",
    agentSessionConfidence: cursor.agentSessionId == null ? detail.agentSessionConfidence : "high",
    agentSessionObservedAt: cursor.identityConfirmedAt ?? detail.agentSessionObservedAt,
  };
};

export const createPaneStateCoordinator = ({
  serverKey,
  createEpoch,
  now,
}: {
  serverKey: string;
  createEpoch?: () => string;
  now?: () => string;
}) => {
  const reducer = createCompletionStateReducer({ createEpoch, now });

  const applyObservation = ({
    pane,
    detail,
    paneState,
  }: {
    pane: PaneMeta;
    detail: SessionDetail;
    paneState: PaneRuntimeState;
  }): PaneCompletionCommit => {
    const events = paneState.pendingAgentLifecycleEvents.splice(0);
    const paneInstanceKey = createPaneInstanceKey({
      serverKey,
      paneId: pane.paneId,
      panePid: pane.panePid,
    });
    const observedAgent = toCompletionAgent(detail.agent);
    const observedDetailLifecycle = toAgentLifecycle(detail.state);
    let explicitSessionStart: Extract<PendingAgentLifecycleEvent, { source: "hook" }> | null = null;
    for (let index = events.length - 1; index >= 0; index -= 1) {
      const event = events[index];
      if (
        event?.source === "hook" &&
        event.eventName === "UserPromptSubmit" &&
        event.agent === observedAgent &&
        !Number.isNaN(Date.parse(event.at))
      ) {
        explicitSessionStart = event;
        break;
      }
    }
    const currentAgentSessionId =
      explicitSessionStart?.source === "hook"
        ? explicitSessionStart.sessionId
        : (detail.agentSessionId ?? null);
    const previousLifecycle = paneState.lifecycle;
    let state: CompletionState = {
      lifecycle: previousLifecycle,
      cursor: paneState.completionCursor,
    };
    let aggregate: Omit<PaneCompletionCommit, "detail" | "source"> = {
      completionAdvanced: false,
      completionEpoch: state.cursor?.epoch ?? null,
      completedSeq: state.cursor?.completedSeq ?? null,
      identityRejected: false,
      confirmedAbsent: false,
      advancedCompletions: [],
    };
    let finalHookStateAccepted: boolean | null = null;

    let restoredIdentityRejected = false;
    const pendingRestoredCursor = paneState.pendingRestoredCompletionCursor;
    const paneInstanceMismatch =
      pendingRestoredCursor?.paneInstanceKey != null &&
      paneInstanceKey != null &&
      pendingRestoredCursor.paneInstanceKey !== paneInstanceKey;
    const paneInstanceConfirmed =
      pendingRestoredCursor?.paneInstanceKey != null &&
      paneInstanceKey != null &&
      pendingRestoredCursor.paneInstanceKey === paneInstanceKey;
    const confirmedAbsentObservation =
      paneState.agentPresence === "absent" &&
      !paneState.agentPresent &&
      paneState.consecutiveAbsentObservations >= 2;
    if (
      pendingRestoredCursor != null &&
      paneState.agentPresence === "present" &&
      observedAgent != null
    ) {
      const currentIdentity: AgentIdentity = {
        agent: observedAgent,
        agentSessionId: currentAgentSessionId,
        paneInstanceKey,
      };
      if (canRestoreCompletionCursor(pendingRestoredCursor, currentIdentity)) {
        state = {
          lifecycle: paneState.pendingRestoredLifecycle ?? previousLifecycle,
          cursor: { ...pendingRestoredCursor },
        };
        paneState.lastResolvedAgent =
          paneState.pendingRestoredLastAgent ?? pendingRestoredCursor.agent;
        paneState.agentPresent = state.cursor?.agentPresent ?? false;
        paneState.consecutiveAbsentObservations = state.cursor?.consecutiveAbsentObservations ?? 0;
      } else {
        restoredIdentityRejected = true;
        state = { lifecycle: previousLifecycle, cursor: null };
        paneState.completionCursor = null;
      }
      paneState.pendingRestoredCompletionCursor = null;
      paneState.pendingRestoredLifecycle = null;
      paneState.pendingRestoredLastAgent = null;
    } else if (pendingRestoredCursor != null && confirmedAbsentObservation) {
      if (paneInstanceMismatch || !paneInstanceConfirmed) {
        restoredIdentityRejected = true;
        state = { lifecycle: previousLifecycle, cursor: null };
        paneState.completionCursor = null;
      }
      paneState.pendingRestoredCompletionCursor = null;
      paneState.pendingRestoredLifecycle = null;
      paneState.pendingRestoredLastAgent = null;
    }

    if (paneState.agentPresence === "present" && observedAgent != null) {
      const reduction = reducer.reduce(state, {
        type: "observe-agent-identity",
        origin: "presence",
        agent: observedAgent,
        agentSessionId: currentAgentSessionId ?? state.cursor?.agentSessionId ?? null,
        paneInstanceKey,
        armSyntheticCompletion:
          !restoredIdentityRejected && (state.cursor == null || state.cursor.agentPresent),
      });
      state = reduction.state;
      aggregate = mergeReduction(aggregate, reduction);
    }

    const acceptedEvents: PendingAgentLifecycleEvent[] = [];
    events.forEach((event) => {
      if (event.source === "herdr") {
        acceptedEvents.push(event);
        return;
      }
      const eventReason =
        event.eventName === "Stop"
          ? "hook:stop"
          : event.eventName === "PermissionRequest"
            ? "hook:permission_request"
            : event.eventName === "Notification"
              ? "hook:permission_prompt"
              : `hook:${event.eventName}`;
      const identity = reducer.reduce(state, {
        type: "observe-agent-identity",
        origin: event.eventName === "UserPromptSubmit" ? "explicit-session-start" : "event",
        agent: event.agent,
        agentSessionId: event.sessionId,
        paneInstanceKey,
        at: event.at,
      });
      state = identity.state;
      aggregate = mergeReduction(aggregate, identity);
      if (eventReason === detail.stateReason) {
        finalHookStateAccepted = !identity.identityRejected;
      }
      if (identity.identityRejected) {
        return;
      }
      acceptedEvents.push(event);
    });

    const ignoreObservedHookLifecycle =
      detail.stateReason.startsWith("hook:") && finalHookStateAccepted === false;
    const preservePendingRestoredLifecycle =
      pendingRestoredCursor != null &&
      (paneState.agentPresence === "indeterminate" ||
        (paneState.agentPresence === "absent" && !confirmedAbsentObservation));
    const observedLifecycle =
      ignoreObservedHookLifecycle || preservePendingRestoredLifecycle
        ? previousLifecycle
        : observedDetailLifecycle;
    if (ignoreObservedHookLifecycle) {
      paneState.hookState = null;
    }

    if (state.cursor != null) {
      const presence = reducer.reduce(state, {
        type: "observe-presence",
        presence: paneState.agentPresence,
        lifecycleWhenAbsent: observedLifecycle === "SHELL" ? "SHELL" : "UNKNOWN",
        lifecycleWhenPresent: observedLifecycle,
      });
      state = presence.state;
      aggregate = mergeReduction(aggregate, presence);
    }

    const eventMatchesCurrentIdentity = (event: PendingAgentLifecycleEvent) => {
      if (event.source === "herdr") return true;
      const cursor = state.cursor;
      if (cursor == null || cursor.agent !== event.agent) return false;
      return !(
        cursor.agentSessionId != null &&
        event.sessionId != null &&
        cursor.agentSessionId !== event.sessionId
      );
    };
    const applyEventIntent = (event: PendingAgentLifecycleEvent) => {
      if (state.cursor != null && !state.cursor.agentPresent) {
        return;
      }
      if (!eventMatchesCurrentIdentity(event)) {
        return;
      }
      if (event.source === "herdr") {
        if (event.agentStatus === "working") {
          const reduction = reducer.reduce(state, {
            type: "begin-run",
            source: "herdr:working",
            at: event.at,
            lifecycle: "RUNNING",
          });
          state = reduction.state;
          aggregate = mergeReduction(aggregate, reduction);
        } else if (event.agentStatus === "done") {
          const reduction = reducer.reduce(state, {
            type: "complete-run",
            source: "herdr:done",
            at: event.at,
            lifecycle: "WAITING_INPUT",
          });
          state = reduction.state;
          aggregate = mergeReduction(aggregate, reduction);
        }
        return;
      }

      if (
        event.eventName === "UserPromptSubmit" ||
        event.eventName === "PreToolUse" ||
        event.eventName === "PostToolUse"
      ) {
        const begin = reducer.reduce(state, {
          type: "begin-run",
          source: `hook:${event.eventName}`,
          at: event.at,
          lifecycle: "RUNNING",
        });
        state = begin.state;
        aggregate = mergeReduction(aggregate, begin);
      } else if (event.eventName === "Stop") {
        const complete = reducer.reduce(state, {
          type: "complete-run",
          source: "hook:stop",
          agent: event.agent,
          agentSessionId: event.sessionId,
          at: event.at,
          lifecycle: "WAITING_INPUT",
        });
        state = complete.state;
        aggregate = mergeReduction(aggregate, complete);
      }
    };
    acceptedEvents.forEach(applyEventIntent);

    if (observedLifecycle === "RUNNING" && state.cursor?.openRunSeq == null) {
      const begin = reducer.reduce(state, {
        type: "begin-run",
        source: "poll:running",
        lifecycle: "RUNNING",
      });
      state = begin.state;
      aggregate = mergeReduction(aggregate, begin);
    } else if (
      previousLifecycle === "RUNNING" &&
      observedLifecycle === "WAITING_INPUT" &&
      state.cursor?.openRunSeq != null
    ) {
      const complete = reducer.reduce(state, {
        type: "complete-run",
        source: "poll",
        lifecycle: "WAITING_INPUT",
      });
      state = complete.state;
      aggregate = mergeReduction(aggregate, complete);
    } else if (state.lifecycle !== observedLifecycle && !aggregate.confirmedAbsent) {
      const lifecycle = reducer.reduce(state, {
        type: "set-lifecycle",
        lifecycle: observedLifecycle,
      });
      state = lifecycle.state;
      aggregate = mergeReduction(aggregate, lifecycle);
    }

    paneState.lifecycle = state.lifecycle;
    paneState.completionCursor = state.cursor;
    if (state.cursor != null) {
      paneState.agentSessionId = state.cursor.agentSessionId;
      paneState.agentSessionSource = state.cursor.agentSessionId == null ? null : "hook";
      paneState.agentSessionConfidence = state.cursor.agentSessionId == null ? null : "high";
      paneState.agentSessionObservedAt = state.cursor.identityConfirmedAt;
      paneState.lastResolvedAgent = state.cursor.agent;
    }

    return {
      detail: projectPublicDetail(detail, state),
      ...aggregate,
      source: resolveEventSource(events),
    };
  };

  const acknowledgeView = ({
    detail,
    paneState,
    epoch,
    throughSeq,
  }: {
    detail: SessionDetail;
    paneState: PaneRuntimeState;
    epoch: string;
    throughSeq: number;
  }): PaneCompletionCommit => {
    const reduction = reducer.reduce(
      { lifecycle: paneState.lifecycle, cursor: paneState.completionCursor },
      { type: "acknowledge-view", epoch, throughSeq },
    );
    paneState.lifecycle = reduction.state.lifecycle;
    paneState.completionCursor = reduction.state.cursor;
    const projectedDetail = projectPublicDetail(detail, reduction.state);
    return {
      detail:
        projectedDetail.state === detail.state
          ? projectedDetail
          : { ...projectedDetail, stateReason: "view:acknowledge" },
      completionAdvanced: false,
      completionEpoch: reduction.state.cursor?.epoch ?? null,
      completedSeq: reduction.state.cursor?.completedSeq ?? null,
      source: "view",
      identityRejected: false,
      confirmedAbsent: false,
      advancedCompletions: [],
    };
  };

  return { applyObservation, acknowledgeView };
};

export type PaneStateCoordinator = ReturnType<typeof createPaneStateCoordinator>;
