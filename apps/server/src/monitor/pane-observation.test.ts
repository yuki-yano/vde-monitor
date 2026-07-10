import { describe, expect, it } from "vitest";

import { applyAgentPresenceObservation } from "./pane-observation";
import { createPaneStateStore } from "./pane-state";

describe("applyAgentPresenceObservation", () => {
  it("confirms absence only after two successful absent observations", () => {
    const paneState = createPaneStateStore().get("%1");

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
  });

  it("keeps the last agent and counter unchanged for indeterminate observations", () => {
    const paneState = createPaneStateStore().get("%1");
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

    expect(paneState.consecutiveAbsentObservations).toBe(0);
    expect(paneState.agentPresent).toBe(true);
    expect(paneState.lastResolvedAgent).toBe("codex");
  });
});
