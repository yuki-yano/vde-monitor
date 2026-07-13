import { createHash } from "node:crypto";

import type { PaneMeta } from "@vde-monitor/multiplexer";
import type { SessionDetail, SessionStateTimelineSource } from "@vde-monitor/shared";

import type { AgentType } from "./agent-resolver-utils";
import {
  type AgentIdentity,
  type AgentLifecycle,
  type CompletionAgent,
  type CompletionReduction,
  type CompletionSource,
  type CompletionState,
  canRestoreCompletionCursor,
  createCompletionStateReducer,
  hasUnacknowledgedCompletion,
  resolvePublicPaneState,
} from "./completion-state";
import {
  type PaneRuntimeState,
  type PendingAgentLifecycleEvent,
  updateRunStartedAt,
} from "./pane-state";

export type PaneCompletionCommit = {
  detail: SessionDetail;
  completionAdvanced: boolean;
  completionEpoch: string | null;
  completedSeq: number | null;
  source: SessionStateTimelineSource;
  identityRejected: boolean;
  confirmedAbsent: boolean;
  advancedCompletions: Array<{
    epoch: string;
    completedSeq: number;
    source: CompletionSource;
    at: string | null;
  }>;
  activityTransitions: Array<{
    type: "start" | "complete";
    epoch: string;
    runSeq: number;
    at: string;
  }>;
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
  completionSource: CompletionSource | null = null,
  completionAt: string | null = null,
) => {
  const nextCompletion =
    reduction.completionAdvanced && reduction.state.cursor != null
      ? {
          epoch: reduction.state.cursor.epoch,
          completedSeq: reduction.state.cursor.completedSeq,
          source: completionSource ?? "confirmed-absent",
          at: completionAt,
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
    activityTransitions: aggregate.activityTransitions,
  };
};

const resolveEventSource = (events: PendingAgentLifecycleEvent[]): SessionStateTimelineSource =>
  events.some(({ source }) => source === "hook") ? "hook" : "poll";

const resolveHookEventReason = (event: Extract<PendingAgentLifecycleEvent, { source: "hook" }>) =>
  event.eventName === "Stop"
    ? "hook:stop"
    : event.eventName === "PermissionRequest"
      ? "hook:permission_request"
      : event.eventName === "Notification"
        ? "hook:permission_prompt"
        : `hook:${event.eventName}`;

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
  const resolveNow = now ?? (() => new Date().toISOString());
  const reducer = createCompletionStateReducer({ createEpoch, now: resolveNow });

  const applyObservation = ({
    pane,
    detail,
    paneState,
  }: {
    pane: PaneMeta;
    detail: SessionDetail;
    paneState: PaneRuntimeState;
  }): PaneCompletionCommit => {
    const lastAuthoritativeEventAtMs = Date.parse(paneState.lastAuthoritativeEventAt ?? "");
    let rejectedObservedHookLifecycle = false;
    const events = paneState.pendingAgentLifecycleEvents
      .splice(0)
      .sort((left, right) => Date.parse(left.at) - Date.parse(right.at))
      .filter((event) => {
        if (
          Number.isNaN(lastAuthoritativeEventAtMs) ||
          Date.parse(event.at) >= lastAuthoritativeEventAtMs
        ) {
          return true;
        }
        if (event.source === "hook" && resolveHookEventReason(event) === detail.stateReason) {
          rejectedObservedHookLifecycle = true;
        }
        return false;
      });
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
      activityTransitions: [],
    };
    let finalHookStateAccepted: boolean | null = rejectedObservedHookLifecycle ? false : null;

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
      const cursorMatchesObservedPane =
        state.cursor?.agent === observedAgent &&
        (state.cursor.paneInstanceKey == null ||
          paneInstanceKey == null ||
          state.cursor.paneInstanceKey === paneInstanceKey);
      const presenceAgentSessionId =
        explicitSessionStart == null
          ? (currentAgentSessionId ?? state.cursor?.agentSessionId ?? null)
          : cursorMatchesObservedPane
            ? (state.cursor?.agentSessionId ?? null)
            : null;
      const reduction = reducer.reduce(state, {
        type: "observe-agent-identity",
        origin: "presence",
        agent: observedAgent,
        agentSessionId: presenceAgentSessionId,
        paneInstanceKey,
        armSyntheticCompletion:
          !restoredIdentityRejected && (state.cursor == null || state.cursor.agentPresent),
      });
      state = reduction.state;
      aggregate = mergeReduction(aggregate, reduction);
    }

    const acceptedEvents: PendingAgentLifecycleEvent[] = [];
    const hookDrivenObservation = detail.stateReason.startsWith("hook:");
    const deferHookLifecycleToEvents =
      hookDrivenObservation && (events.length > 0 || rejectedObservedHookLifecycle);
    const preservePendingRestoredLifecycle =
      pendingRestoredCursor != null &&
      (paneState.agentPresence === "indeterminate" ||
        (paneState.agentPresence === "absent" && !confirmedAbsentObservation));
    const observedLifecycle =
      deferHookLifecycleToEvents || preservePendingRestoredLifecycle
        ? previousLifecycle
        : observedDetailLifecycle;

    if (state.cursor != null) {
      const presence = reducer.reduce(state, {
        type: "observe-presence",
        presence: paneState.agentPresence,
        lifecycleWhenAbsent: observedLifecycle === "SHELL" ? "SHELL" : "UNKNOWN",
        lifecycleWhenPresent: observedLifecycle,
      });
      state = presence.state;
      aggregate = mergeReduction(aggregate, presence, "confirmed-absent");
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
      const eventReason = event.source === "hook" ? resolveHookEventReason(event) : null;
      if (event.source === "hook") {
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
      }
      acceptedEvents.push(event);
      paneState.lastAuthoritativeEventAt = event.at;
      if (!eventMatchesCurrentIdentity(event)) {
        return;
      }
      const beginsRun =
        (event.source === "herdr" && event.agentStatus === "working") ||
        (event.source === "hook" &&
          (event.eventName === "UserPromptSubmit" ||
            event.eventName === "PreToolUse" ||
            event.eventName === "PostToolUse"));
      if (state.cursor != null && !state.cursor.agentPresent) {
        if (beginsRun) {
          const cursor = state.cursor;
          const reset = reducer.reduce(state, {
            type: "reset-agent-epoch",
            agent: event.source === "hook" ? event.agent : cursor.agent,
            agentSessionId: event.source === "hook" ? event.sessionId : cursor.agentSessionId,
            paneInstanceKey,
            at: event.at,
            agentPresent: true,
            syntheticCompletionArmed: false,
          });
          state = reset.state;
          aggregate = mergeReduction(aggregate, reset);
        }
        const explicitCompletionSource =
          event.source === "herdr" && event.agentStatus === "done"
            ? "herdr:done"
            : event.source === "hook" && event.eventName === "Stop"
              ? "hook:stop"
              : null;
        const completion = aggregate.advancedCompletions.find(
          ({ epoch, completedSeq }) =>
            epoch === state.cursor?.epoch && completedSeq === state.cursor.completedSeq,
        );
        if (
          !beginsRun &&
          explicitCompletionSource != null &&
          completion?.source === "confirmed-absent"
        ) {
          completion.source = explicitCompletionSource;
          completion.at = event.at;
          aggregate.activityTransitions.push({
            type: "complete",
            epoch: completion.epoch,
            runSeq: completion.completedSeq,
            at: event.at,
          });
        }
        if (!beginsRun) return;
      }
      if (event.source === "herdr") {
        if (event.agentStatus === "working") {
          const previousOpenRunSeq = state.cursor?.openRunSeq ?? null;
          const previousRunId =
            state.cursor?.openRunSeq == null
              ? null
              : `${state.cursor.epoch}:${state.cursor.openRunSeq}`;
          const reduction = reducer.reduce(state, {
            type: "begin-run",
            source: "herdr:working",
            at: event.at,
            lifecycle: "RUNNING",
          });
          state = reduction.state;
          aggregate = mergeReduction(aggregate, reduction);
          const cursor = state.cursor;
          if (previousOpenRunSeq == null && cursor?.openRunSeq != null) {
            updateRunStartedAt(paneState, event.at);
          }
          if (
            cursor?.openRunSeq != null &&
            `${cursor.epoch}:${cursor.openRunSeq}` !== previousRunId
          ) {
            aggregate.activityTransitions.push({
              type: "start",
              epoch: cursor.epoch,
              runSeq: cursor.openRunSeq,
              at: event.at,
            });
          }
        } else if (event.agentStatus === "done") {
          const reduction = reducer.reduce(state, {
            type: "complete-run",
            source: "herdr:done",
            at: event.at,
            lifecycle: "WAITING_INPUT",
          });
          state = reduction.state;
          aggregate = mergeReduction(aggregate, reduction, "herdr:done", event.at);
          if (reduction.completionAdvanced && state.cursor != null) {
            aggregate.activityTransitions.push({
              type: "complete",
              epoch: state.cursor.epoch,
              runSeq: state.cursor.completedSeq,
              at: event.at,
            });
          }
        }
        return;
      }

      if (
        event.eventName === "UserPromptSubmit" ||
        event.eventName === "PreToolUse" ||
        event.eventName === "PostToolUse"
      ) {
        const previousOpenRunSeq = state.cursor?.openRunSeq ?? null;
        const previousRunId =
          state.cursor?.openRunSeq == null
            ? null
            : `${state.cursor.epoch}:${state.cursor.openRunSeq}`;
        const begin = reducer.reduce(state, {
          type: "begin-run",
          source: `hook:${event.eventName}`,
          at: event.at,
          lifecycle: "RUNNING",
        });
        state = begin.state;
        aggregate = mergeReduction(aggregate, begin);
        const cursor = state.cursor;
        if (previousOpenRunSeq == null && cursor?.openRunSeq != null) {
          updateRunStartedAt(paneState, event.at);
        }
        if (
          cursor?.openRunSeq != null &&
          `${cursor.epoch}:${cursor.openRunSeq}` !== previousRunId
        ) {
          aggregate.activityTransitions.push({
            type: "start",
            epoch: cursor.epoch,
            runSeq: cursor.openRunSeq,
            at: event.at,
          });
        }
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
        aggregate = mergeReduction(aggregate, complete, "hook:stop", event.at);
        if (complete.completionAdvanced && state.cursor != null) {
          aggregate.activityTransitions.push({
            type: "complete",
            epoch: state.cursor.epoch,
            runSeq: state.cursor.completedSeq,
            at: event.at,
          });
        }
      } else if (
        eventReason === detail.stateReason &&
        state.lifecycle !== observedDetailLifecycle
      ) {
        const lifecycle = reducer.reduce(state, {
          type: "set-lifecycle",
          lifecycle: observedDetailLifecycle,
        });
        state = lifecycle.state;
        aggregate = mergeReduction(aggregate, lifecycle);
      }
    };
    events.forEach(applyEventIntent);

    const ignoreObservedHookLifecycle = hookDrivenObservation && finalHookStateAccepted === false;
    if (ignoreObservedHookLifecycle) {
      paneState.hookState = null;
    }

    if (
      !deferHookLifecycleToEvents &&
      observedLifecycle === "RUNNING" &&
      state.cursor?.openRunSeq == null
    ) {
      const previousOpenRunSeq = state.cursor?.openRunSeq ?? null;
      const startedAt = resolveNow();
      const begin = reducer.reduce(state, {
        type: "begin-run",
        source: "poll:running",
        at: startedAt,
        lifecycle: "RUNNING",
      });
      state = begin.state;
      aggregate = mergeReduction(aggregate, begin);
      if (previousOpenRunSeq == null && state.cursor?.openRunSeq != null) {
        updateRunStartedAt(paneState, startedAt);
      }
    } else if (
      !deferHookLifecycleToEvents &&
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
      aggregate = mergeReduction(aggregate, complete, "poll");
    } else if (
      !deferHookLifecycleToEvents &&
      state.lifecycle !== observedLifecycle &&
      !aggregate.confirmedAbsent
    ) {
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
      detail: projectPublicDetail(
        {
          ...detail,
          lastRunStartedAt: paneState.lastRunStartedAt,
          manualSortAt: paneState.manualSortAt,
        },
        state,
      ),
      ...aggregate,
      source: resolveEventSource(acceptedEvents),
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
      activityTransitions: [],
    };
  };

  return { applyObservation, acknowledgeView };
};

export type PaneStateCoordinator = ReturnType<typeof createPaneStateCoordinator>;
