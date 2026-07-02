import { describe, expect, it } from "vitest";

import { DEFAULT_PULL_GESTURE_CONFIG, createPullGestureTracker } from "./pull-gesture";

const createTracker = () => createPullGestureTracker(DEFAULT_PULL_GESTURE_CONFIG);

describe("createPullGestureTracker", () => {
  it("stays idle when the gesture cannot pull", () => {
    const tracker = createTracker();
    tracker.start(100, 100, false);
    const result = tracker.move(100, 200);
    expect(result.phase).toBe("idle");
    expect(result.preventDefault).toBe(false);
    expect(tracker.end().shouldRefresh).toBe(false);
  });

  it("does not activate on small finger drift during a tap", () => {
    const tracker = createTracker();
    tracker.start(100, 100, true);
    const result = tracker.move(103, 106);
    expect(result.phase).toBe("tracking");
    expect(result.preventDefault).toBe(false);
    expect(result.pullDistancePx).toBe(0);
    expect(tracker.end().shouldRefresh).toBe(false);
  });

  it("disarms on horizontal-dominant movement", () => {
    const tracker = createTracker();
    tracker.start(100, 100, true);
    const result = tracker.move(140, 110);
    expect(result.phase).toBe("idle");
    // later vertical movement must not re-activate the disarmed gesture
    expect(tracker.move(140, 300).phase).toBe("idle");
    expect(tracker.end().shouldRefresh).toBe(false);
  });

  it("disarms on upward movement", () => {
    const tracker = createTracker();
    tracker.start(100, 100, true);
    const result = tracker.move(100, 80);
    expect(result.phase).toBe("idle");
    expect(result.preventDefault).toBe(false);
  });

  it("activates pulling after the activation distance and prevents default", () => {
    const tracker = createTracker();
    tracker.start(100, 100, true);
    const result = tracker.move(102, 100 + DEFAULT_PULL_GESTURE_CONFIG.activationDistancePx + 24);
    expect(result.phase).toBe("pulling");
    expect(result.preventDefault).toBe(true);
    expect(result.pullDistancePx).toBeCloseTo(24 / DEFAULT_PULL_GESTURE_CONFIG.resistance);
  });

  it("caps the pull distance at maxPullDistancePx", () => {
    const tracker = createTracker();
    tracker.start(100, 100, true);
    const result = tracker.move(100, 2000);
    expect(result.phase).toBe("pulling");
    expect(result.pullDistancePx).toBe(DEFAULT_PULL_GESTURE_CONFIG.maxPullDistancePx);
  });

  it("requests a refresh when released beyond the refresh threshold", () => {
    const tracker = createTracker();
    const { activationDistancePx, refreshThresholdPx, resistance } = DEFAULT_PULL_GESTURE_CONFIG;
    tracker.start(100, 100, true);
    tracker.move(100, 100 + activationDistancePx + refreshThresholdPx * resistance + 10);
    expect(tracker.end().shouldRefresh).toBe(true);
  });

  it("does not refresh when released before the refresh threshold", () => {
    const tracker = createTracker();
    tracker.start(100, 100, true);
    tracker.move(100, 140);
    expect(tracker.end().shouldRefresh).toBe(false);
  });

  it("cancels pulling when the finger returns above the start point", () => {
    const tracker = createTracker();
    tracker.start(100, 100, true);
    tracker.move(100, 200);
    const result = tracker.move(100, 90);
    expect(result.phase).toBe("idle");
    expect(result.preventDefault).toBe(false);
    expect(tracker.end().shouldRefresh).toBe(false);
  });

  it("resets state via cancel", () => {
    const tracker = createTracker();
    tracker.start(100, 100, true);
    tracker.move(100, 200);
    tracker.cancel();
    expect(tracker.move(100, 300).phase).toBe("idle");
    expect(tracker.end().shouldRefresh).toBe(false);
  });
});
