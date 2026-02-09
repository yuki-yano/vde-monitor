import { describe, expect, it, vi } from "vitest";

import { updatePaneOutputState } from "./pane-output";
import type { PaneRuntimeState } from "./pane-state";

describe("updatePaneOutputState", () => {
  const basePane = {
    paneId: "1",
    paneActivity: null,
    windowActivity: null,
    paneActive: false,
    paneDead: false,
    alternateOn: false,
  };

  const createState = (overrides: Partial<PaneRuntimeState> = {}): PaneRuntimeState => ({
    hookState: null,
    lastOutputAt: null,
    lastEventAt: null,
    lastMessage: null,
    lastInputAt: null,
    externalInputCursorBytes: null,
    externalInputSignature: null,
    externalInputLastDetectedAt: null,
    lastFingerprint: null,
    lastFingerprintCaptureAtMs: null,
    ...overrides,
  });

  it("updates output timestamp from log mtime and clears stale hook state", async () => {
    const state = createState({
      hookState: { state: "RUNNING", reason: "hook:test", at: "2024-01-01T00:00:00.000Z" },
    });
    const result = await updatePaneOutputState({
      pane: basePane,
      paneState: state,
      logPath: "/tmp/log",
      inactiveThresholdMs: 1000,
      deps: {
        statLogMtime: async () => "2024-01-02T00:00:00.000Z",
        resolveActivityAt: () => null,
        captureFingerprint: async () => null,
        now: () => new Date("2024-01-03T00:00:00.000Z"),
      },
    });

    expect(result.outputAt).toBe("2024-01-02T00:00:00.000Z");
    expect(result.hookState).toBeNull();
    expect(state.hookState).toBeNull();
  });

  it("keeps waiting hook state even when output advances", async () => {
    const state = createState({
      hookState: { state: "WAITING_INPUT", reason: "hook:stop", at: "2024-01-01T00:00:00.000Z" },
    });
    const result = await updatePaneOutputState({
      pane: basePane,
      paneState: state,
      logPath: "/tmp/log",
      inactiveThresholdMs: 1000,
      deps: {
        statLogMtime: async () => "2024-01-02T00:00:00.000Z",
        resolveActivityAt: () => null,
        captureFingerprint: async () => null,
        now: () => new Date("2024-01-03T00:00:00.000Z"),
      },
    });

    expect(result.outputAt).toBe("2024-01-02T00:00:00.000Z");
    expect(result.hookState).toEqual({
      state: "WAITING_INPUT",
      reason: "hook:stop",
      at: "2024-01-01T00:00:00.000Z",
    });
  });

  it("keeps waiting-permission hook state when output advances", async () => {
    const state = createState({
      hookState: {
        state: "WAITING_PERMISSION",
        reason: "hook:approval",
        at: "2024-01-01T00:00:00.000Z",
      },
    });
    const result = await updatePaneOutputState({
      pane: basePane,
      paneState: state,
      logPath: "/tmp/log",
      inactiveThresholdMs: 1000,
      deps: {
        statLogMtime: async () => "2024-01-02T00:00:00.000Z",
        resolveActivityAt: () => null,
        captureFingerprint: async () => null,
        now: () => new Date("2024-01-03T00:00:00.000Z"),
      },
    });

    expect(result.outputAt).toBe("2024-01-02T00:00:00.000Z");
    expect(result.hookState).toEqual({
      state: "WAITING_PERMISSION",
      reason: "hook:approval",
      at: "2024-01-01T00:00:00.000Z",
    });
  });

  it("uses fallback timestamp when no activity is available", async () => {
    const state = createState();
    const now = new Date("2024-01-03T00:00:10.000Z");
    const result = await updatePaneOutputState({
      pane: basePane,
      paneState: state,
      logPath: "/tmp/log",
      inactiveThresholdMs: 5000,
      deps: {
        statLogMtime: async () => null,
        resolveActivityAt: () => null,
        captureFingerprint: async () => null,
        now: () => now,
      },
    });

    const expected = new Date(now.getTime() - 5000 - 1000).toISOString();
    expect(result.outputAt).toBe(expected);
  });

  it("updates output timestamp when fingerprint changes", async () => {
    const state = createState({ lastFingerprint: "old" });
    const now = new Date("2024-01-03T00:00:00.000Z");
    const result = await updatePaneOutputState({
      pane: basePane,
      paneState: state,
      logPath: "/tmp/log",
      inactiveThresholdMs: 1000,
      deps: {
        statLogMtime: async () => null,
        resolveActivityAt: () => null,
        captureFingerprint: async () => "new",
        now: () => now,
      },
    });

    expect(state.lastFingerprint).toBe("new");
    expect(result.outputAt).toBe(now.toISOString());
  });

  it("does not capture fingerprint when log timestamp is available", async () => {
    const state = createState({ lastFingerprint: "old" });
    const captureFingerprint = vi.fn(async () => "new");

    const result = await updatePaneOutputState({
      pane: basePane,
      paneState: state,
      logPath: "/tmp/log",
      inactiveThresholdMs: 1000,
      deps: {
        statLogMtime: async () => "2024-01-02T00:00:00.000Z",
        resolveActivityAt: () => null,
        captureFingerprint,
        now: () => new Date("2024-01-03T00:00:00.000Z"),
      },
    });

    expect(result.outputAt).toBe("2024-01-02T00:00:00.000Z");
    expect(captureFingerprint).not.toHaveBeenCalled();
  });

  it("captures fingerprint when activity timestamp is available but log timestamp is missing", async () => {
    const state = createState({ lastFingerprint: "old" });
    const captureFingerprint = vi.fn(async () => "new");
    const now = new Date("2024-01-03T00:00:00.000Z");

    const result = await updatePaneOutputState({
      pane: basePane,
      paneState: state,
      logPath: null,
      inactiveThresholdMs: 1000,
      deps: {
        statLogMtime: async () => null,
        resolveActivityAt: () => "2024-01-02T23:59:59.000Z",
        captureFingerprint,
        now: () => now,
      },
    });

    expect(captureFingerprint).toHaveBeenCalledTimes(1);
    expect(state.lastFingerprint).toBe("new");
    expect(result.outputAt).toBe(now.toISOString());
  });

  it("throttles fingerprint capture when log timestamp is unavailable", async () => {
    const state = createState({ lastFingerprint: "same" });
    const captureFingerprint = vi.fn(async () => "same");
    let nowMs = Date.parse("2024-01-03T00:00:00.000Z");
    const run = async () =>
      updatePaneOutputState({
        pane: basePane,
        paneState: state,
        logPath: null,
        inactiveThresholdMs: 1000,
        deps: {
          statLogMtime: async () => null,
          resolveActivityAt: () => null,
          captureFingerprint,
          now: () => new Date(nowMs),
        },
      });

    await run();
    nowMs += 1000;
    await run();
    nowMs += 1000;
    await run();

    expect(captureFingerprint).toHaveBeenCalledTimes(1);

    nowMs += 5000;
    await run();

    expect(captureFingerprint).toHaveBeenCalledTimes(2);
  });

  it("uses custom fingerprint capture interval", async () => {
    const state = createState({ lastFingerprint: "same" });
    const captureFingerprint = vi.fn(async () => "same");
    let nowMs = Date.parse("2024-01-03T00:00:00.000Z");
    const run = async () =>
      updatePaneOutputState({
        pane: basePane,
        paneState: state,
        logPath: null,
        inactiveThresholdMs: 1000,
        deps: {
          statLogMtime: async () => null,
          resolveActivityAt: () => null,
          captureFingerprint,
          fingerprintIntervalMs: 20000,
          now: () => new Date(nowMs),
        },
      });

    await run();
    nowMs += 5000;
    await run();
    nowMs += 14000;
    await run();

    expect(captureFingerprint).toHaveBeenCalledTimes(1);

    nowMs += 1000;
    await run();

    expect(captureFingerprint).toHaveBeenCalledTimes(2);
  });

  it("skips log mtime lookup when logPath is null", async () => {
    const state = createState({ lastFingerprint: "old" });
    const statLogMtime = async () => "2024-01-02T00:00:00.000Z";
    const statSpy = vi.fn(statLogMtime);
    const now = new Date("2024-01-03T00:00:00.000Z");

    const result = await updatePaneOutputState({
      pane: basePane,
      paneState: state,
      logPath: null,
      inactiveThresholdMs: 1000,
      deps: {
        statLogMtime: statSpy,
        resolveActivityAt: () => null,
        captureFingerprint: async () => "new",
        now: () => now,
      },
    });

    expect(statSpy).not.toHaveBeenCalled();
    expect(result.outputAt).toBe(now.toISOString());
  });

  it("updates lastInputAt when external detector reports a new input", async () => {
    const state = createState();
    const detectExternalInputFromLogDelta = vi.fn(async () => ({
      detectedAt: "2024-01-04T00:00:00.000Z",
      nextCursorBytes: 42,
      signature: "sig-1",
      reason: "detected" as const,
    }));

    const result = await updatePaneOutputState({
      pane: basePane,
      paneState: state,
      isAgentPane: true,
      logPath: "/tmp/log",
      inactiveThresholdMs: 1000,
      deps: {
        statLogMtime: async () => null,
        resolveActivityAt: () => null,
        captureFingerprint: async () => null,
        detectExternalInputFromLogDelta,
        now: () => new Date("2024-01-04T00:00:00.000Z"),
      },
    });

    expect(detectExternalInputFromLogDelta).toHaveBeenCalledTimes(1);
    expect(state.lastInputAt).toBe("2024-01-04T00:00:00.000Z");
    expect(state.externalInputCursorBytes).toBe(42);
    expect(state.externalInputSignature).toBe("sig-1");
    expect(state.externalInputLastDetectedAt).toBe("2024-01-04T00:00:00.000Z");
    expect(result.inputTouchedAt).toBe("2024-01-04T00:00:00.000Z");
  });

  it("does not update lastInputAt when detected timestamp is older", async () => {
    const state = createState({ lastInputAt: "2024-01-05T00:00:00.000Z" });
    const detectExternalInputFromLogDelta = vi.fn(async () => ({
      detectedAt: "2024-01-04T00:00:00.000Z",
      nextCursorBytes: 43,
      signature: "sig-2",
      reason: "detected" as const,
    }));

    const result = await updatePaneOutputState({
      pane: basePane,
      paneState: state,
      isAgentPane: true,
      logPath: "/tmp/log",
      inactiveThresholdMs: 1000,
      deps: {
        statLogMtime: async () => null,
        resolveActivityAt: () => null,
        captureFingerprint: async () => null,
        detectExternalInputFromLogDelta,
        now: () => new Date("2024-01-05T00:00:00.000Z"),
      },
    });

    expect(state.lastInputAt).toBe("2024-01-05T00:00:00.000Z");
    expect(state.externalInputLastDetectedAt).toBeNull();
    expect(result.inputTouchedAt).toBeNull();
  });

  it("skips external detector for non-agent panes", async () => {
    const state = createState();
    const detectExternalInputFromLogDelta = vi.fn(async () => ({
      detectedAt: "2024-01-04T00:00:00.000Z",
      nextCursorBytes: 42,
      signature: "sig-1",
      reason: "detected" as const,
    }));

    await updatePaneOutputState({
      pane: basePane,
      paneState: state,
      isAgentPane: false,
      logPath: "/tmp/log",
      inactiveThresholdMs: 1000,
      deps: {
        statLogMtime: async () => null,
        resolveActivityAt: () => null,
        captureFingerprint: async () => null,
        detectExternalInputFromLogDelta,
        now: () => new Date("2024-01-04T00:00:00.000Z"),
      },
    });

    expect(detectExternalInputFromLogDelta).not.toHaveBeenCalled();
    expect(state.lastInputAt).toBeNull();
  });

  it("continues monitor cycle when external detector throws", async () => {
    const state = createState();
    const detectExternalInputFromLogDelta = vi.fn(async () => {
      throw new Error("boom");
    });
    const result = await updatePaneOutputState({
      pane: basePane,
      paneState: state,
      isAgentPane: true,
      logPath: "/tmp/log",
      inactiveThresholdMs: 1000,
      deps: {
        statLogMtime: async () => "2024-01-02T00:00:00.000Z",
        resolveActivityAt: () => null,
        captureFingerprint: async () => null,
        detectExternalInputFromLogDelta,
        now: () => new Date("2024-01-04T00:00:00.000Z"),
      },
    });

    expect(result.outputAt).toBe("2024-01-02T00:00:00.000Z");
    expect(result.inputTouchedAt).toBeNull();
    expect(state.lastInputAt).toBeNull();
  });
});
