import { describe, expect, it } from "vitest";

import {
  createPaneStateStore,
  updateInputAt,
  updateManualSortAt,
  updateOutputAt,
  updateRunStartedAt,
} from "./pane-state";

describe("pane-state", () => {
  it("updates input timestamp only when newer", () => {
    const state = createPaneStateStore().get("pane-1");
    state.lastInputAt = "2024-01-02T00:00:00.000Z";

    updateInputAt(state, "2024-01-01T00:00:00.000Z");
    expect(state.lastInputAt).toBe("2024-01-02T00:00:00.000Z");

    updateInputAt(state, "2024-01-03T00:00:00.000Z");
    expect(state.lastInputAt).toBe("2024-01-03T00:00:00.000Z");
  });

  it("ignores invalid input timestamp updates", () => {
    const state = createPaneStateStore().get("pane-1");
    state.lastInputAt = "2024-01-02T00:00:00.000Z";

    updateInputAt(state, "invalid");
    expect(state.lastInputAt).toBe("2024-01-02T00:00:00.000Z");
  });

  it("updates run and manual sort timestamps only when newer", () => {
    const state = createPaneStateStore().get("pane-1");

    updateRunStartedAt(state, "2024-01-02T00:00:00.000Z");
    updateRunStartedAt(state, "2024-01-01T00:00:00.000Z");
    updateManualSortAt(state, "2024-01-04T00:00:00.000Z");
    updateManualSortAt(state, "invalid");

    expect(state.lastRunStartedAt).toBe("2024-01-02T00:00:00.000Z");
    expect(state.manualSortAt).toBe("2024-01-04T00:00:00.000Z");
  });

  it("updates output timestamp only when newer", () => {
    const store = createPaneStateStore();
    const state = store.get("pane-1");
    state.lastOutputAt = "2024-01-02T00:00:00.000Z";
    updateOutputAt(state, "2024-01-01T00:00:00.000Z");
    expect(state.lastOutputAt).toBe("2024-01-02T00:00:00.000Z");
    updateOutputAt(state, "2024-01-03T00:00:00.000Z");
    expect(state.lastOutputAt).toBe("2024-01-03T00:00:00.000Z");
  });

  it("prunes missing panes", () => {
    const store = createPaneStateStore();
    const state = store.get("pane-1");
    state.lastInputAt = "keep";
    store.get("pane-2");
    store.pruneMissing(new Set(["pane-2"]));
    const refreshed = store.get("pane-1");
    expect(refreshed.lastInputAt).toBeNull();
  });
});
