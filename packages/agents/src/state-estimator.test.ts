import { describe, expect, it, vi } from "vitest";

import { estimateState } from "./state-estimator";

describe("estimateState", () => {
  it("returns UNKNOWN when pane is dead", () => {
    const result = estimateState({
      paneDead: true,
      lastOutputAt: null,
      hookState: { state: "RUNNING", reason: "hook", at: "2026-01-01T00:00:00Z" },
      thresholds: { runningThresholdMs: 1000, inactiveThresholdMs: 2000 },
    });
    expect(result).toEqual({ state: "UNKNOWN", reason: "pane_dead" });
  });

  it("prioritizes hook state", () => {
    const result = estimateState({
      paneDead: false,
      lastOutputAt: null,
      hookState: {
        state: "WAITING_PERMISSION",
        reason: "hook:permission",
        at: "2026-01-01T00:00:00Z",
      },
      thresholds: { runningThresholdMs: 1000, inactiveThresholdMs: 2000 },
    });
    expect(result).toEqual({ state: "WAITING_PERMISSION", reason: "hook:permission" });
  });

  it("returns RUNNING when recent output is within threshold", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:10Z"));
    const result = estimateState({
      paneDead: false,
      lastOutputAt: "2026-01-01T00:00:05Z",
      hookState: null,
      thresholds: { runningThresholdMs: 6000, inactiveThresholdMs: 20000 },
    });
    expect(result).toEqual({ state: "RUNNING", reason: "recent_output" });
    vi.useRealTimers();
  });

  it("treats output at running threshold as RUNNING", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:10Z"));
    const result = estimateState({
      paneDead: false,
      lastOutputAt: "2026-01-01T00:00:00Z",
      hookState: null,
      thresholds: { runningThresholdMs: 10000, inactiveThresholdMs: 20000 },
    });
    expect(result).toEqual({ state: "RUNNING", reason: "recent_output" });
    vi.useRealTimers();
  });

  it("returns WAITING_INPUT when output is older than inactive threshold", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:01:10Z"));
    const result = estimateState({
      paneDead: false,
      lastOutputAt: "2026-01-01T00:00:00Z",
      hookState: null,
      thresholds: { runningThresholdMs: 10000, inactiveThresholdMs: 60000 },
    });
    expect(result).toEqual({ state: "WAITING_INPUT", reason: "inactive_timeout" });
    vi.useRealTimers();
  });

  it("treats output at inactive threshold as inactive_timeout", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:01:00Z"));
    const result = estimateState({
      paneDead: false,
      lastOutputAt: "2026-01-01T00:00:00Z",
      hookState: null,
      thresholds: { runningThresholdMs: 10000, inactiveThresholdMs: 60000 },
    });
    expect(result).toEqual({ state: "WAITING_INPUT", reason: "inactive_timeout" });
    vi.useRealTimers();
  });

  it("returns WAITING_INPUT when output is stale but below inactive threshold", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:40Z"));
    const result = estimateState({
      paneDead: false,
      lastOutputAt: "2026-01-01T00:00:00Z",
      hookState: null,
      thresholds: { runningThresholdMs: 10000, inactiveThresholdMs: 60000 },
    });
    expect(result).toEqual({ state: "WAITING_INPUT", reason: "recently_inactive" });
    vi.useRealTimers();
  });

  it("returns UNKNOWN when no signals are present", () => {
    const result = estimateState({
      paneDead: false,
      lastOutputAt: null,
      hookState: null,
      thresholds: { runningThresholdMs: 1000, inactiveThresholdMs: 2000 },
    });
    expect(result).toEqual({ state: "UNKNOWN", reason: "no_signal" });
  });

  it("returns UNKNOWN when lastOutputAt is invalid", () => {
    const result = estimateState({
      paneDead: false,
      lastOutputAt: "not-a-date",
      hookState: null,
      thresholds: { runningThresholdMs: 1000, inactiveThresholdMs: 2000 },
    });
    expect(result).toEqual({ state: "UNKNOWN", reason: "no_signal" });
  });

  it("treats future output timestamp as RUNNING", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const result = estimateState({
      paneDead: false,
      lastOutputAt: "2026-01-01T00:00:10Z",
      hookState: null,
      thresholds: { runningThresholdMs: 1000, inactiveThresholdMs: 2000 },
    });
    expect(result).toEqual({ state: "RUNNING", reason: "recent_output" });
    vi.useRealTimers();
  });
});
