import { describe, expect, it } from "vitest";

import { applyAgentPresenceObservation } from "./pane-observation";
import { createPaneStateStore } from "./pane-state";

describe("applyAgentPresenceObservation", () => {
  it("confirms absence only after two successful absent observations", () => {
    const paneState = createPaneStateStore().get("%1");
    paneState.hookState = {
      state: "WAITING_INPUT",
      reason: "hook:stop",
      at: "2026-07-19T00:00:00.000Z",
    };
    paneState.codexQuestionPromptActive = true;

    const firstPresent = applyAgentPresenceObservation({
      observedAgent: "codex",
      presence: "present",
      paneState,
    });
    expect(firstPresent).toMatchObject({
      agent: "unknown",
      preserveResolvedState: true,
      confirmedAgentAbsent: false,
    });
    expect(paneState.agentPresent).toBe(false);
    expect(paneState.agentPresence).toBe("indeterminate");

    expect(
      applyAgentPresenceObservation({
        observedAgent: "codex",
        presence: "present",
        paneState,
      }),
    ).toMatchObject({ agent: "codex", confirmedAgentAbsent: false });

    const firstAbsent = applyAgentPresenceObservation({
      observedAgent: "unknown",
      presence: "absent",
      paneState,
    });
    expect(firstAbsent).toMatchObject({
      agent: "codex",
      preserveResolvedState: true,
      confirmedAgentAbsent: false,
      agentBecameAbsent: false,
    });
    expect(paneState.consecutiveAbsentObservations).toBe(1);
    expect(paneState.agentPresent).toBe(true);
    expect(paneState.hookState).not.toBeNull();
    expect(paneState.codexQuestionPromptActive).toBe(true);

    const secondAbsent = applyAgentPresenceObservation({
      observedAgent: "unknown",
      presence: "absent",
      paneState,
    });
    expect(secondAbsent).toMatchObject({
      agent: "unknown",
      preserveResolvedState: false,
      confirmedAgentAbsent: true,
      agentBecameAbsent: true,
    });
    expect(paneState.consecutiveAbsentObservations).toBe(2);
    expect(paneState.agentPresent).toBe(false);
    expect(paneState.hookState).toBeNull();
    expect(paneState.codexQuestionPromptActive).toBe(false);
  });

  it("keeps the last agent and counter unchanged for indeterminate observations", () => {
    const paneState = createPaneStateStore().get("%1");
    applyAgentPresenceObservation({
      observedAgent: "claude",
      presence: "present",
      paneState,
    });
    applyAgentPresenceObservation({
      observedAgent: "claude",
      presence: "present",
      paneState,
    });
    applyAgentPresenceObservation({
      observedAgent: "unknown",
      presence: "absent",
      paneState,
    });

    const indeterminate = applyAgentPresenceObservation({
      observedAgent: "unknown",
      presence: "indeterminate",
      paneState,
    });

    expect(indeterminate).toMatchObject({
      agent: "claude",
      preserveResolvedState: true,
      confirmedAgentAbsent: false,
    });
    expect(paneState.consecutiveAbsentObservations).toBe(1);
    expect(paneState.agentPresent).toBe(true);
  });

  it("resets the absent counter when an agent is present again", () => {
    const paneState = createPaneStateStore().get("%1");
    applyAgentPresenceObservation({
      observedAgent: "unknown",
      presence: "absent",
      paneState,
    });

    applyAgentPresenceObservation({
      observedAgent: "codex",
      presence: "present",
      paneState,
    });
    applyAgentPresenceObservation({
      observedAgent: "codex",
      presence: "present",
      paneState,
    });

    expect(paneState.consecutiveAbsentObservations).toBe(0);
    expect(paneState.agentPresent).toBe(true);
    expect(paneState.lastResolvedAgent).toBe("codex");
  });

  it("does not promote a one-poll Agent candidate", () => {
    const paneState = createPaneStateStore().get("%1");

    applyAgentPresenceObservation({
      observedAgent: "codex",
      presence: "present",
      paneState,
    });
    const absent = applyAgentPresenceObservation({
      observedAgent: "unknown",
      presence: "absent",
      paneState,
    });

    expect(absent.agent).toBe("unknown");
    expect(paneState.agentPresent).toBe(false);
    expect(paneState.lastResolvedAgent).toBe("unknown");
    expect(paneState.candidateAgent).toBeNull();
  });

  it("does not replace a confirmed Agent from one different observation", () => {
    const paneState = createPaneStateStore().get("%1");
    applyAgentPresenceObservation({ observedAgent: "claude", presence: "present", paneState });
    applyAgentPresenceObservation({ observedAgent: "claude", presence: "present", paneState });

    const transient = applyAgentPresenceObservation({
      observedAgent: "codex",
      presence: "present",
      paneState,
    });

    expect(transient).toMatchObject({ agent: "claude", preserveResolvedState: true });
    expect(paneState.agentPresent).toBe(true);
    expect(paneState.lastResolvedAgent).toBe("claude");
    expect(paneState.agentPresence).toBe("indeterminate");
  });

  it("requires successful present observations to be consecutive", () => {
    const paneState = createPaneStateStore().get("%1");
    applyAgentPresenceObservation({ observedAgent: "codex", presence: "present", paneState });
    applyAgentPresenceObservation({
      observedAgent: "unknown",
      presence: "indeterminate",
      paneState,
    });

    const nextPresent = applyAgentPresenceObservation({
      observedAgent: "codex",
      presence: "present",
      paneState,
    });

    expect(nextPresent.agent).toBe("unknown");
    expect(paneState.agentPresent).toBe(false);
    expect(paneState.candidateAgentPresentObservations).toBe(1);
  });
});
