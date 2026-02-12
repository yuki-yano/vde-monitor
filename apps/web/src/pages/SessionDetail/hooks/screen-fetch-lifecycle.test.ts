import { describe, expect, it } from "vitest";

import {
  initialScreenFetchLifecycleState,
  screenFetchLifecycleReducer,
} from "./screen-fetch-lifecycle";

describe("screenFetchLifecycleReducer", () => {
  it("starts tracking in-flight request", () => {
    const next = screenFetchLifecycleReducer(initialScreenFetchLifecycleState, {
      type: "start",
      requestId: 10,
      mode: "text",
    });

    expect(next.inFlight).toEqual({
      id: 10,
      mode: "text",
    });
  });

  it("clears in-flight request only when ids match", () => {
    const loadingState = screenFetchLifecycleReducer(initialScreenFetchLifecycleState, {
      type: "start",
      requestId: 11,
      mode: "image",
    });

    const unchanged = screenFetchLifecycleReducer(loadingState, {
      type: "finish",
      requestId: 99,
    });
    expect(unchanged).toBe(loadingState);

    const finished = screenFetchLifecycleReducer(loadingState, {
      type: "finish",
      requestId: 11,
    });
    expect(finished.inFlight).toBeNull();
  });

  it("resets state", () => {
    const loadingState = screenFetchLifecycleReducer(initialScreenFetchLifecycleState, {
      type: "start",
      requestId: 12,
      mode: "text",
    });

    const reset = screenFetchLifecycleReducer(loadingState, {
      type: "reset",
    });
    expect(reset).toEqual(initialScreenFetchLifecycleState);
  });
});
