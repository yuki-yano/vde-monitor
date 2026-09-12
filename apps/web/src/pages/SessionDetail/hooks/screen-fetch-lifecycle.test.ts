import { describe, expect, it } from "vitest";

import {
  initialScreenFetchLifecycleState,
  screenFetchLifecycleReducer,
} from "./screen-fetch-lifecycle";

describe("screenFetchLifecycleReducer", () => {
  it("does not start a new request while the same context request is in flight", () => {
    const loadingState = screenFetchLifecycleReducer(initialScreenFetchLifecycleState, {
      type: "request",
      contextKey: "pane-1\0image",
      mode: "image",
      modeSwitch: null,
      modeLoaded: { text: true, image: true },
      hasCurrentData: true,
    });

    const next = screenFetchLifecycleReducer(loadingState, {
      type: "request",
      contextKey: "pane-1\0image",
      mode: "image",
      modeSwitch: null,
      modeLoaded: { text: true, image: true },
      hasCurrentData: true,
    });

    expect(next.inFlight).toEqual(loadingState.inFlight);
    expect(next.nextRequestId).toBe(2);
    expect(next.latestAttempt).toBeNull();
  });

  it("clears in-flight request only when ids match", () => {
    const loadingState = screenFetchLifecycleReducer(initialScreenFetchLifecycleState, {
      type: "request",
      contextKey: "pane-1\0image",
      mode: "image",
      modeSwitch: null,
      modeLoaded: { text: true, image: true },
      hasCurrentData: true,
    });

    const unchanged = screenFetchLifecycleReducer(loadingState, {
      type: "finish",
      requestId: 99,
    });
    expect(unchanged).toBe(loadingState);

    const finished = screenFetchLifecycleReducer(loadingState, {
      type: "finish",
      requestId: 1,
    });
    expect(finished.inFlight).toBeNull();
    expect(finished.latestAttempt).toBeNull();
    expect(finished.nextRequestId).toBe(2);
  });

  it("resets only in-flight state while preserving request id sequence", () => {
    const loadingState = screenFetchLifecycleReducer(initialScreenFetchLifecycleState, {
      type: "request",
      contextKey: "pane-1\0text",
      mode: "text",
      modeSwitch: null,
      modeLoaded: { text: true, image: false },
      hasCurrentData: true,
    });

    const reset = screenFetchLifecycleReducer(loadingState, {
      type: "reset",
    });
    expect(reset.inFlight).toBeNull();
    expect(reset.latestAttempt).toBeNull();
    expect(reset.nextRequestId).toBe(2);
  });
});
