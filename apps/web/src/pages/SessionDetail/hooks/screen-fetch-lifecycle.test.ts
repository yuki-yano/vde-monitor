import { describe, expect, it } from "vitest";

import {
  initialScreenFetchLifecycleState,
  screenFetchLifecycleReducer,
} from "./screen-fetch-lifecycle";

describe("screenFetchLifecycleReducer", () => {
  it("starts tracking request with generated id and loading metadata", () => {
    const next = screenFetchLifecycleReducer(initialScreenFetchLifecycleState, {
      type: "request",
      mode: "text",
      modeSwitch: "text",
      modeLoaded: { text: false, image: false },
    });

    expect(next.inFlight).toEqual({
      id: 1,
      mode: "text",
    });
    expect(next.nextRequestId).toBe(2);
    expect(next.latestAttempt).toEqual({
      requestId: 1,
      isModeSwitch: true,
      shouldShowLoading: true,
    });
  });

  it("does not start a new request while same mode request is in flight", () => {
    const loadingState = screenFetchLifecycleReducer(initialScreenFetchLifecycleState, {
      type: "request",
      mode: "image",
      modeSwitch: null,
      modeLoaded: { text: true, image: true },
    });

    const next = screenFetchLifecycleReducer(loadingState, {
      type: "request",
      mode: "image",
      modeSwitch: null,
      modeLoaded: { text: true, image: true },
    });

    expect(next.inFlight).toEqual(loadingState.inFlight);
    expect(next.nextRequestId).toBe(2);
    expect(next.latestAttempt).toBeNull();
  });

  it("clears in-flight request only when ids match", () => {
    const loadingState = screenFetchLifecycleReducer(initialScreenFetchLifecycleState, {
      type: "request",
      mode: "image",
      modeSwitch: null,
      modeLoaded: { text: true, image: true },
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
      mode: "text",
      modeSwitch: null,
      modeLoaded: { text: true, image: false },
    });

    const reset = screenFetchLifecycleReducer(loadingState, {
      type: "reset",
    });
    expect(reset.inFlight).toBeNull();
    expect(reset.latestAttempt).toBeNull();
    expect(reset.nextRequestId).toBe(2);
  });
});
