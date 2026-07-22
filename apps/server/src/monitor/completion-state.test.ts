import { describe, expect, it } from "vitest";

import {
  type CompletionCursor,
  type CompletionState,
  canRestoreCompletionCursor,
  createCompletionStateReducer,
  createInitialCompletionState,
  getCompletionInvariantViolations,
  hasUnacknowledgedCompletion,
  isAuthoritativeCompletionSource,
  resolvePublicPaneState,
} from "./completion-state";

const BASE_TIME = "2026-07-10T00:00:00.000Z";
const LATER_TIME = "2026-07-10T00:00:01.000Z";

const createHarness = () => {
  let nextEpoch = 0;
  const reducer = createCompletionStateReducer({
    createEpoch: () => `epoch-${++nextEpoch}`,
    now: () => BASE_TIME,
  });

  const observeInitialPresence = (
    overrides: Partial<{
      agent: "codex" | "claude";
      agentSessionId: string | null;
      paneInstanceKey: string | null;
      armSyntheticCompletion: boolean;
    }> = {},
  ): CompletionState =>
    reducer.reduce(createInitialCompletionState(), {
      type: "observe-agent-identity",
      origin: "presence",
      agent: overrides.agent ?? "codex",
      agentSessionId: overrides.agentSessionId ?? null,
      paneInstanceKey: overrides.paneInstanceKey ?? "pane-1:pid-100",
      at: BASE_TIME,
      armSyntheticCompletion: overrides.armSyntheticCompletion ?? true,
    }).state;

  return { reducer, observeInitialPresence };
};

const requireCursor = (state: CompletionState): CompletionCursor => {
  expect(state.cursor).not.toBeNull();
  return state.cursor as CompletionCursor;
};

const expectValid = (state: CompletionState): void => {
  if (state.cursor != null) {
    expect(getCompletionInvariantViolations(state.cursor)).toEqual([]);
  }
};

describe("completion state reducer", () => {
  it("S1-S8: advances runs, completions, and acknowledgements monotonically by generation", () => {
    const { reducer, observeInitialPresence } = createHarness();
    let state = observeInitialPresence();

    // S1: Start the first run.
    state = reducer.reduce(state, { type: "begin-run", source: "hook:start" }).state;
    expect(requireCursor(state)).toMatchObject({
      runSeq: 1,
      openRunSeq: 1,
      completedSeq: 0,
      acknowledgedSeq: 0,
      syntheticCompletionArmed: false,
    });
    expect(resolvePublicPaneState(state)).toBe("RUNNING");

    // S2: A duplicate Begin does not create a new generation.
    const duplicateBegin = reducer.reduce(state, {
      type: "begin-run",
      source: "hook:start:duplicate",
    });
    expect(duplicateBegin.state.cursor).toEqual(state.cursor);
    expect(duplicateBegin.completionAdvanced).toBe(false);

    // S3: A Stop for an open run advances completion and produces DONE.
    const firstCompletion = reducer.reduce(state, {
      type: "complete-run",
      source: "hook:stop",
    });
    state = firstCompletion.state;
    expect(firstCompletion.completionAdvanced).toBe(true);
    expect(requireCursor(state)).toMatchObject({
      runSeq: 1,
      openRunSeq: null,
      completedSeq: 1,
      acknowledgedSeq: 0,
    });
    expect(resolvePublicPaneState(state)).toBe("DONE");

    // S4: A duplicate Complete does not complete the same generation again.
    const duplicateCompletion = reducer.reduce(state, {
      type: "complete-run",
      source: "hook:stop",
    });
    expect(duplicateCompletion.completionAdvanced).toBe(false);
    expect(duplicateCompletion.state.cursor).toEqual(state.cursor);

    // S5-S6: Display acknowledgement for the same epoch produces WAITING_INPUT without reverting.
    const firstCursor = requireCursor(state);
    const acknowledged = reducer.reduce(state, {
      type: "acknowledge-view",
      epoch: firstCursor.epoch,
      throughSeq: firstCursor.completedSeq,
    });
    state = acknowledged.state;
    expect(acknowledged.acknowledgementApplied).toBe(true);
    expect(resolvePublicPaneState(state)).toBe("WAITING_INPUT");
    state = reducer.reduce(state, {
      type: "set-lifecycle",
      lifecycle: "WAITING_INPUT",
    }).state;
    expect(resolvePublicPaneState(state)).toBe("WAITING_INPUT");

    // S7: The next Begin opens generation 2.
    state = reducer.reduce(state, { type: "begin-run", source: "hook:start" }).state;
    expect(requireCursor(state)).toMatchObject({
      runSeq: 2,
      openRunSeq: 2,
      completedSeq: 1,
      acknowledgedSeq: 1,
    });
    expect(resolvePublicPaneState(state)).toBe("RUNNING");

    // S8: An acknowledgement with an old throughSeq does not preempt generation 2 completion.
    const staleAck = reducer.reduce(state, {
      type: "acknowledge-view",
      epoch: requireCursor(state).epoch,
      throughSeq: 1,
    });
    expect(staleAck.acknowledgementApplied).toBe(false);
    state = reducer.reduce(staleAck.state, {
      type: "complete-run",
      source: "hook:stop",
    }).state;
    expect(requireCursor(state)).toMatchObject({ completedSeq: 2, acknowledgedSeq: 1 });
    expect(resolvePublicPaneState(state)).toBe("DONE");
    expectValid(state);
  });

  it("S9: treats acknowledgement for a stale epoch as a successful no-op", () => {
    const { reducer, observeInitialPresence } = createHarness();
    const oldState = observeInitialPresence({ agentSessionId: "session-a" });
    const oldEpoch = requireCursor(oldState).epoch;
    const currentState = reducer.reduce(oldState, {
      type: "observe-agent-identity",
      origin: "explicit-session-start",
      agent: "codex",
      agentSessionId: "session-b",
      paneInstanceKey: "pane-1:pid-100",
      at: LATER_TIME,
    }).state;

    const result = reducer.reduce(currentState, {
      type: "acknowledge-view",
      epoch: oldEpoch,
      throughSeq: 100,
    });

    expect(result.acknowledgementApplied).toBe(false);
    expect(result.state).toBe(currentState);
    expect(requireCursor(result.state).epoch).not.toBe(oldEpoch);
  });

  it("S10-S11: prioritizes WAITING_PERMISSION and RUNNING over unacknowledged DONE", () => {
    const { reducer, observeInitialPresence } = createHarness();
    let state = observeInitialPresence();
    state = reducer.reduce(state, { type: "begin-run", source: "hook:start" }).state;
    state = reducer.reduce(state, { type: "complete-run", source: "hook:stop" }).state;
    expect(hasUnacknowledgedCompletion(state.cursor)).toBe(true);

    state = reducer.reduce(state, {
      type: "set-lifecycle",
      lifecycle: "WAITING_PERMISSION",
    }).state;
    expect(resolvePublicPaneState(state)).toBe("WAITING_PERMISSION");

    state = reducer.reduce(state, { type: "set-lifecycle", lifecycle: "RUNNING" }).state;
    expect(resolvePublicPaneState(state)).toBe("RUNNING");
  });

  it("prioritizes the current non-agent lifecycle after the agent becomes absent", () => {
    const { reducer, observeInitialPresence } = createHarness();
    let state = observeInitialPresence();
    state = reducer.reduce(state, { type: "begin-run", source: "hook:start" }).state;
    state = reducer.reduce(state, { type: "complete-run", source: "hook:stop" }).state;
    expect(hasUnacknowledgedCompletion(state.cursor)).toBe(true);

    state = reducer.reduce(state, {
      type: "observe-presence",
      presence: "absent",
      lifecycleWhenAbsent: "SHELL",
    }).state;
    state = reducer.reduce(state, {
      type: "observe-presence",
      presence: "absent",
      lifecycleWhenAbsent: "SHELL",
    }).state;
    expect(requireCursor(state)).toMatchObject({
      agentPresent: false,
      completedSeq: 1,
      acknowledgedSeq: 0,
    });
    expect(resolvePublicPaneState(state)).toBe("SHELL");

    state = reducer.reduce(state, { type: "set-lifecycle", lifecycle: "UNKNOWN" }).state;
    expect(resolvePublicPaneState(state)).toBe("UNKNOWN");
  });

  it("S12-S13: restores state only for the same identity", () => {
    const { reducer, observeInitialPresence } = createHarness();
    let state = observeInitialPresence({
      agentSessionId: "session-a",
      paneInstanceKey: "pane-1:pid-100",
    });
    state = reducer.reduce(state, { type: "begin-run", source: "hook:start" }).state;
    state = reducer.reduce(state, { type: "complete-run", source: "hook:stop" }).state;
    const persisted = requireCursor(state);

    expect(
      canRestoreCompletionCursor(persisted, {
        agent: "codex",
        agentSessionId: "session-a",
        paneInstanceKey: "pane-recreated:pid-999",
      }),
    ).toBe(true);
    expect(resolvePublicPaneState(state)).toBe("DONE");

    expect(
      canRestoreCompletionCursor(persisted, {
        agent: "codex",
        agentSessionId: "session-b",
        paneInstanceKey: "pane-1:pid-100",
      }),
    ).toBe(false);
    expect(
      canRestoreCompletionCursor(persisted, {
        agent: "claude",
        agentSessionId: "session-a",
        paneInstanceKey: "pane-1:pid-100",
      }),
    ).toBe(false);
  });

  it("S14-S17: generates one synthetic completion for an armed cursor from authoritative input", () => {
    const { reducer, observeInitialPresence } = createHarness();

    // S14: Herdr done is an authoritative completion.
    let herdr = observeInitialPresence({ agent: "claude" });
    const herdrResult = reducer.reduce(herdr, {
      type: "complete-run",
      source: "herdr:done",
      agent: "claude",
    });
    herdr = herdrResult.state;
    expect(herdrResult.completionAdvanced).toBe(true);
    expect(requireCursor(herdr)).toMatchObject({ runSeq: 1, completedSeq: 1 });
    expect(resolvePublicPaneState(herdr)).toBe("DONE");

    // S15: Polling can close an explicitly opened run.
    let poll = observeInitialPresence();
    poll = reducer.reduce(poll, { type: "begin-run", source: "poll:running" }).state;
    const pollResult = reducer.reduce(poll, { type: "complete-run", source: "poll" });
    expect(pollResult.completionAdvanced).toBe(true);
    expect(requireCursor(pollResult.state)).toMatchObject({ runSeq: 1, completedSeq: 1 });

    // S16: An armed cursor without a session ID binds the Stop ID and completes synthetically.
    let stop = observeInitialPresence();
    const stopResult = reducer.reduce(stop, {
      type: "complete-run",
      source: "hook:stop",
      agent: "codex",
      agentSessionId: "session-from-stop",
      at: LATER_TIME,
    });
    stop = stopResult.state;
    expect(requireCursor(stop)).toMatchObject({
      agentSessionId: "session-from-stop",
      identityConfirmedAt: LATER_TIME,
      runSeq: 1,
      completedSeq: 1,
      syntheticCompletionArmed: false,
    });
    const duplicateStop = reducer.reduce(stop, {
      type: "complete-run",
      source: "hook:stop",
      agentSessionId: "session-from-stop",
    });
    expect(duplicateStop.completionAdvanced).toBe(false);

    // S17: A cursor created by an explicit start is not armed and ignores Stop without an open run.
    let explicit = reducer.reduce(createInitialCompletionState(), {
      type: "observe-agent-identity",
      origin: "explicit-session-start",
      agent: "codex",
      agentSessionId: "explicit-session",
      paneInstanceKey: "pane-1:pid-100",
      at: BASE_TIME,
    }).state;
    explicit = reducer.reduce(explicit, {
      type: "complete-run",
      source: "hook:stop",
      agentSessionId: "explicit-session",
    }).state;
    expect(requireCursor(explicit)).toMatchObject({
      runSeq: 0,
      completedSeq: 0,
      syntheticCompletionArmed: false,
    });
    expect(resolvePublicPaneState(explicit)).toBe("WAITING_INPUT");
  });

  it("S18: closes an open run after confirmed absence without masking the shell", () => {
    const { reducer, observeInitialPresence } = createHarness();
    let state = observeInitialPresence();
    state = reducer.reduce(state, { type: "begin-run", source: "hook:start" }).state;

    const firstAbsent = reducer.reduce(state, {
      type: "observe-presence",
      presence: "absent",
      lifecycleWhenAbsent: "SHELL",
    });
    state = firstAbsent.state;
    expect(firstAbsent.confirmedAbsent).toBe(false);
    expect(requireCursor(state)).toMatchObject({
      agentPresent: true,
      consecutiveAbsentObservations: 1,
      openRunSeq: 1,
      completedSeq: 0,
    });

    const indeterminate = reducer.reduce(state, {
      type: "observe-presence",
      presence: "indeterminate",
    });
    expect(indeterminate.state).toBe(state);
    expect(requireCursor(indeterminate.state).consecutiveAbsentObservations).toBe(1);

    const confirmedAbsent = reducer.reduce(state, {
      type: "observe-presence",
      presence: "absent",
      lifecycleWhenAbsent: "SHELL",
    });
    state = confirmedAbsent.state;
    expect(confirmedAbsent.confirmedAbsent).toBe(true);
    expect(confirmedAbsent.completionAdvanced).toBe(true);
    expect(requireCursor(state)).toMatchObject({
      agentPresent: false,
      syntheticCompletionArmed: false,
      consecutiveAbsentObservations: 2,
      openRunSeq: null,
      completedSeq: 1,
      acknowledgedSeq: 0,
    });
    expect(resolvePublicPaneState(state)).toBe("SHELL");

    const oldEpoch = requireCursor(state).epoch;
    state = reducer.reduce(state, {
      type: "observe-presence",
      presence: "present",
      at: LATER_TIME,
      lifecycleWhenPresent: "RUNNING",
    }).state;
    expect(requireCursor(state)).toMatchObject({
      agentPresent: true,
      syntheticCompletionArmed: false,
      runSeq: 0,
      completedSeq: 0,
    });
    expect(requireCursor(state).epoch).not.toBe(oldEpoch);
    expectValid(state);
  });

  it("S19: completes an explicitly opened run when polling observes its end", () => {
    const { reducer, observeInitialPresence } = createHarness();
    let state = observeInitialPresence();
    state = reducer.reduce(state, { type: "begin-run", source: "poll:running" }).state;
    const completed = reducer.reduce(state, { type: "complete-run", source: "poll" });

    expect(completed.completionAdvanced).toBe(true);
    expect(requireCursor(completed.state)).toMatchObject({ openRunSeq: null, completedSeq: 1 });
    expect(resolvePublicPaneState(completed.state)).toBe("DONE");
  });

  it("S20-S21: drops delayed old-identity events and changes epoch on a newer explicit start", () => {
    const { reducer, observeInitialPresence } = createHarness();
    let state = observeInitialPresence({ agentSessionId: "session-a" });
    state = reducer.reduce(state, { type: "begin-run", source: "hook:start" }).state;

    // S20: An old Stop that conflicts with the current identity changes nothing, including lifecycle.
    const delayedStop = reducer.reduce(state, {
      type: "complete-run",
      source: "hook:stop",
      agent: "codex",
      agentSessionId: "session-old",
      at: "2026-07-09T23:59:59.000Z",
    });
    expect(delayedStop.identityRejected).toBe(true);
    expect(delayedStop.state).toBe(state);
    expect(resolvePublicPaneState(delayedStop.state)).toBe("RUNNING");

    const staleStart = reducer.reduce(state, {
      type: "observe-agent-identity",
      origin: "explicit-session-start",
      agent: "codex",
      agentSessionId: "session-b",
      paneInstanceKey: "pane-1:pid-100",
      at: BASE_TIME,
    });
    expect(staleStart.identityRejected).toBe(true);
    expect(staleStart.state).toBe(state);

    const invalidStart = reducer.reduce(state, {
      type: "observe-agent-identity",
      origin: "explicit-session-start",
      agent: "codex",
      agentSessionId: "session-b",
      paneInstanceKey: "pane-1:pid-100",
      at: "not-a-timestamp",
    });
    expect(invalidStart.identityRejected).toBe(true);

    // S21: Only a newer explicit session start creates a new epoch.
    const oldEpoch = requireCursor(state).epoch;
    const switched = reducer.reduce(state, {
      type: "observe-agent-identity",
      origin: "explicit-session-start",
      agent: "codex",
      agentSessionId: "session-b",
      paneInstanceKey: "pane-1:pid-100",
      at: LATER_TIME,
    });
    expect(switched.epochChanged).toBe(true);
    expect(requireCursor(switched.state)).toMatchObject({
      agentSessionId: "session-b",
      identityConfirmedAt: LATER_TIME,
      syntheticCompletionArmed: false,
      runSeq: 0,
      completedSeq: 0,
      acknowledgedSeq: 0,
    });
    expect(requireCursor(switched.state).epoch).not.toBe(oldEpoch);
    expect(resolvePublicPaneState(switched.state)).toBe("RUNNING");
  });

  it("S22: keeps the absence count when authoritative inventory reports a processless backend present", () => {
    const { reducer, observeInitialPresence } = createHarness();
    let state = observeInitialPresence({ paneInstanceKey: null, agentSessionId: null });

    state = reducer.reduce(state, {
      type: "observe-presence",
      presence: "present",
      lifecycleWhenPresent: "WAITING_INPUT",
    }).state;
    state = reducer.reduce(state, {
      type: "observe-presence",
      presence: "present",
      lifecycleWhenPresent: "WAITING_INPUT",
    }).state;

    expect(requireCursor(state)).toMatchObject({
      agentPresent: true,
      consecutiveAbsentObservations: 0,
    });
    expect(
      canRestoreCompletionCursor(requireCursor(state), {
        agent: "codex",
        agentSessionId: null,
        paneInstanceKey: null,
      }),
    ).toBe(false);
  });

  it("clamps acknowledgement to completedSeq and treats invalid values as no-ops", () => {
    const { reducer, observeInitialPresence } = createHarness();
    let state = observeInitialPresence();
    state = reducer.reduce(state, { type: "begin-run", source: "hook:start" }).state;
    state = reducer.reduce(state, { type: "complete-run", source: "hook:stop" }).state;
    const epoch = requireCursor(state).epoch;

    state = reducer.reduce(state, {
      type: "acknowledge-view",
      epoch,
      throughSeq: 999,
    }).state;
    expect(requireCursor(state).acknowledgedSeq).toBe(1);

    for (const throughSeq of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
      const result = reducer.reduce(state, {
        type: "acknowledge-view",
        epoch,
        throughSeq,
      });
      expect(result.state).toBe(state);
      expect(result.acknowledgementApplied).toBe(false);
    }
  });

  it("arms synthetic completion when the active agent type or pane instance changes", () => {
    const { reducer, observeInitialPresence } = createHarness();
    const initial = observeInitialPresence();
    const initialEpoch = requireCursor(initial).epoch;

    const paneChanged = reducer.reduce(initial, {
      type: "observe-agent-identity",
      origin: "presence",
      agent: "codex",
      agentSessionId: null,
      paneInstanceKey: "pane-1:pid-200",
      at: LATER_TIME,
      armSyntheticCompletion: true,
    });
    expect(paneChanged.epochChanged).toBe(true);
    expect(requireCursor(paneChanged.state)).toMatchObject({
      paneInstanceKey: "pane-1:pid-200",
      syntheticCompletionArmed: true,
    });
    expect(requireCursor(paneChanged.state).epoch).not.toBe(initialEpoch);

    const agentChanged = reducer.reduce(paneChanged.state, {
      type: "observe-agent-identity",
      origin: "presence",
      agent: "claude",
      agentSessionId: null,
      paneInstanceKey: "pane-1:pid-200",
      at: LATER_TIME,
      armSyntheticCompletion: true,
    });
    expect(requireCursor(agentChanged.state)).toMatchObject({
      agent: "claude",
      syntheticCompletionArmed: true,
    });
  });

  it("defines public state priority and the authoritative source set", () => {
    const { observeInitialPresence } = createHarness();
    const base = observeInitialPresence();
    const cursor = {
      ...requireCursor(base),
      syntheticCompletionArmed: false,
      runSeq: 1,
      completedSeq: 1,
      acknowledgedSeq: 0,
    };

    expect(resolvePublicPaneState({ lifecycle: "WAITING_INPUT", cursor })).toBe("DONE");
    expect(resolvePublicPaneState({ lifecycle: "SHELL", cursor })).toBe("SHELL");
    expect(resolvePublicPaneState({ lifecycle: "UNKNOWN", cursor })).toBe("UNKNOWN");
    expect(
      resolvePublicPaneState({ lifecycle: "SHELL", cursor: { ...cursor, agentPresent: false } }),
    ).toBe("SHELL");
    expect(isAuthoritativeCompletionSource("hook:stop")).toBe(true);
    expect(isAuthoritativeCompletionSource("herdr:done")).toBe(true);
    expect(isAuthoritativeCompletionSource("poll")).toBe(false);
    expect(isAuthoritativeCompletionSource("confirmed-absent")).toBe(false);
  });

  it("detects invariant violations", () => {
    const { observeInitialPresence } = createHarness();
    const cursor = requireCursor(observeInitialPresence());

    expect(
      getCompletionInvariantViolations({
        ...cursor,
        syntheticCompletionArmed: false,
        runSeq: 1,
        completedSeq: 2,
        acknowledgedSeq: 3,
        openRunSeq: 0,
      }),
    ).toEqual([
      "acknowledgedSeq must not exceed completedSeq",
      "completedSeq must not exceed runSeq",
      "openRunSeq must be null or equal runSeq",
    ]);
  });
});
