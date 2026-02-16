import type { AgentMonitorConfig, PaneMeta, SessionDetail } from "@vde-monitor/shared";
import { describe, expect, it, vi } from "vitest";

import type { PaneLogManager } from "./pane-log-manager";
import { processPane } from "./pane-processor";
import type { PaneRuntimeState } from "./pane-state";

const createPaneState = (overrides: Partial<PaneRuntimeState> = {}): PaneRuntimeState => ({
  hookState: null,
  lastOutputAt: null,
  lastEventAt: null,
  lastMessage: null,
  lastInputAt: null,
  externalInputCursorBytes: null,
  externalInputSignature: null,
  externalInputLastDetectedAt: null,
  externalInputLastCheckedAt: null,
  externalInputLastReason: null,
  externalInputLastReasonCode: null,
  externalInputLastErrorMessage: null,
  lastFingerprint: null,
  lastFingerprintCaptureAtMs: null,
  ...overrides,
});

const createPaneLogManager = (overrides: Partial<PaneLogManager> = {}): PaneLogManager => ({
  pipeSupport: "tmux-pipe",
  getPaneLogPath: vi.fn(() => "/tmp/log"),
  ensureLogFiles: vi.fn(async () => {}),
  preparePaneLogging: vi.fn(async () => ({
    pipeAttached: false,
    pipeConflict: false,
    logPath: "/tmp/log",
  })),
  ...overrides,
});

const basePane: PaneMeta = {
  paneId: "%1",
  sessionName: "main",
  windowIndex: 0,
  paneIndex: 1,
  windowActivity: null,
  paneActivity: null,
  paneActive: true,
  currentCommand: "bash",
  currentPath: "/tmp/project",
  paneTty: "/dev/ttys001",
  paneDead: false,
  panePipe: false,
  alternateOn: false,
  panePid: 123,
  paneTitle: null,
  paneStartCommand: "bash",
  pipeTagValue: "0",
};

const baseConfig = {
  activity: { runningThresholdMs: 20000, inactiveThresholdMs: 60000 },
} as AgentMonitorConfig;

describe("processPane", () => {
  it("returns null when pane should be ignored", async () => {
    const updatePaneOutputState = vi.fn();
    const result = await processPane(
      {
        pane: basePane,
        config: baseConfig,
        paneStates: { get: () => createPaneState() },
        paneLogManager: createPaneLogManager(),
        capturePaneFingerprint: vi.fn(async () => null),
        applyRestored: vi.fn(() => null),
        getCustomTitle: vi.fn(() => null),
        resolveRepoRoot: vi.fn(async () => null),
      },
      {
        resolvePaneAgent: vi.fn(async () => ({ agent: "unknown" as const, ignore: true })),
        updatePaneOutputState,
      },
    );

    expect(result).toBeNull();
    expect(updatePaneOutputState).not.toHaveBeenCalled();
  });

  it("returns detail for shell panes and skips pipe logging", async () => {
    const preparePaneLogging = vi.fn(async () => ({
      pipeAttached: false,
      pipeConflict: false,
      logPath: "/tmp/log",
    }));
    const getPaneLogPath = vi.fn(() => "/tmp/log");
    const updatePaneOutputState = vi.fn(async () => ({
      outputAt: "2024-01-01T00:00:00.000Z",
      hookState: null,
      inputTouchedAt: null,
    }));
    const result = await processPane(
      {
        pane: basePane,
        config: baseConfig,
        paneStates: { get: () => createPaneState() },
        paneLogManager: createPaneLogManager({ preparePaneLogging, getPaneLogPath }),
        capturePaneFingerprint: vi.fn(async () => null),
        applyRestored: vi.fn(() => null),
        getCustomTitle: vi.fn(() => null),
        resolveRepoRoot: vi.fn(async () => null),
      },
      {
        resolvePaneAgent: vi.fn(async () => ({ agent: "unknown" as const, ignore: false })),
        updatePaneOutputState,
      },
    );

    expect(result).not.toBeNull();
    expect(result?.state).toBe("SHELL");
    expect(preparePaneLogging).not.toHaveBeenCalled();
    expect(updatePaneOutputState).toHaveBeenCalledWith(
      expect.objectContaining({
        isAgentPane: false,
        logPath: "/tmp/log",
        deps: expect.objectContaining({
          fingerprintIntervalMs: 5000,
          allowFingerprintCapture: false,
        }),
      }),
    );
  });

  it("does not resolve pipe tag fallback for non-agent panes", async () => {
    const resolvePanePipeTagValue = vi.fn(async () => "1");
    const updatePaneOutputState = vi.fn(async () => ({
      outputAt: "2024-01-01T00:00:00.000Z",
      hookState: null,
      inputTouchedAt: null,
    }));

    await processPane(
      {
        pane: { ...basePane, pipeTagValue: null },
        config: baseConfig,
        paneStates: { get: () => createPaneState() },
        paneLogManager: createPaneLogManager(),
        capturePaneFingerprint: vi.fn(async () => null),
        applyRestored: vi.fn(() => null),
        getCustomTitle: vi.fn(() => null),
        resolveRepoRoot: vi.fn(async () => null),
        resolvePanePipeTagValue,
      },
      {
        resolvePaneAgent: vi.fn(async () => ({ agent: "unknown" as const, ignore: false })),
        updatePaneOutputState,
      },
    );

    expect(resolvePanePipeTagValue).not.toHaveBeenCalled();
  });

  it("passes null logPath for shell pane when pipe support is none", async () => {
    const updatePaneOutputState = vi.fn(async () => ({
      outputAt: "2024-01-01T00:00:00.000Z",
      hookState: null,
      inputTouchedAt: null,
    }));

    await processPane(
      {
        pane: basePane,
        config: baseConfig,
        paneStates: { get: () => createPaneState() },
        paneLogManager: createPaneLogManager({ pipeSupport: "none" }),
        capturePaneFingerprint: vi.fn(async () => null),
        applyRestored: vi.fn(() => null),
        getCustomTitle: vi.fn(() => null),
        resolveRepoRoot: vi.fn(async () => null),
      },
      {
        resolvePaneAgent: vi.fn(async () => ({ agent: "unknown" as const, ignore: false })),
        updatePaneOutputState,
      },
    );

    expect(updatePaneOutputState).toHaveBeenCalledWith(expect.objectContaining({ logPath: null }));
  });

  it("returns detail with restored state when available", async () => {
    const paneState = createPaneState({ lastMessage: "msg" });
    const worktreePath = "/tmp/project/.worktree/feature/worktree";
    const resolveRepoRoot = vi.fn(async () => worktreePath);
    const resolveBranch = vi.fn(async () => "feature/fallback");
    const resolveWorktreeStatus = vi.fn(() => ({
      repoRoot: "/tmp/project",
      worktreePath,
      branch: "feature/worktree",
      worktreeDirty: true,
      worktreeLocked: true,
      worktreeLockOwner: "codex",
      worktreeLockReason: "in progress",
      worktreeMerged: false,
    }));
    const updatePaneOutputState = vi.fn(async () => ({
      outputAt: "2024-01-01T00:00:00.000Z",
      hookState: null,
      inputTouchedAt: null,
    }));
    const detail = await processPane(
      {
        pane: basePane,
        config: baseConfig,
        paneStates: { get: () => paneState },
        paneLogManager: createPaneLogManager({
          preparePaneLogging: vi.fn(async () => ({
            pipeAttached: true,
            pipeConflict: false,
            logPath: "/tmp/log",
          })),
        }),
        capturePaneFingerprint: vi.fn(async () => null),
        applyRestored: vi.fn(() => ({ state: "WAITING_INPUT" }) as SessionDetail),
        getCustomTitle: vi.fn(() => "Custom"),
        resolveRepoRoot,
        resolveWorktreeStatus,
        resolveBranch,
      },
      {
        resolvePaneAgent: vi.fn(async () => ({ agent: "codex" as const, ignore: false })),
        updatePaneOutputState,
        estimateSessionState: vi.fn(() => ({ state: "RUNNING" as const, reason: "estimated" })),
      },
    );

    expect(detail).not.toBeNull();
    expect(detail?.state).toBe("WAITING_INPUT");
    expect(detail?.stateReason).toBe("restored");
    expect(detail?.customTitle).toBe("Custom");
    expect(detail?.branch).toBe("feature/worktree");
    expect(detail?.worktreePath).toBe(worktreePath);
    expect(detail?.worktreeDirty).toBe(true);
    expect(detail?.worktreeLocked).toBe(true);
    expect(resolveRepoRoot).toHaveBeenCalledWith("/tmp/project");
    expect(resolveBranch).not.toHaveBeenCalled();
    expect(updatePaneOutputState).toHaveBeenCalledWith(
      expect.objectContaining({
        isAgentPane: true,
        deps: expect.objectContaining({
          fingerprintIntervalMs: 5000,
          allowFingerprintCapture: true,
        }),
      }),
    );
  });

  it("keeps worktree context for non-vw-managed worktree paths", async () => {
    const resolveRepoRoot = vi.fn(async () => "/tmp/project");
    const resolveWorktreeStatus = vi.fn(() => ({
      repoRoot: "/tmp/project",
      worktreePath: "/tmp/project",
      branch: "main",
      worktreeDirty: false,
      worktreeLocked: false,
      worktreeLockOwner: null,
      worktreeLockReason: null,
      worktreeMerged: false,
    }));
    const updatePaneOutputState = vi.fn(async () => ({
      outputAt: "2024-01-01T00:00:00.000Z",
      hookState: null,
      inputTouchedAt: null,
    }));

    const detail = await processPane(
      {
        pane: basePane,
        config: baseConfig,
        paneStates: { get: () => createPaneState() },
        paneLogManager: createPaneLogManager(),
        capturePaneFingerprint: vi.fn(async () => null),
        applyRestored: vi.fn(() => null),
        getCustomTitle: vi.fn(() => null),
        resolveRepoRoot,
        resolveWorktreeStatus,
      },
      {
        resolvePaneAgent: vi.fn(async () => ({ agent: "codex" as const, ignore: false })),
        updatePaneOutputState,
      },
    );

    expect(detail?.worktreePath).toBe("/tmp/project");
  });

  it("ignores mismatched worktree snapshot and falls back to repo resolvers", async () => {
    const resolveRepoRoot = vi.fn(async () => "/tmp/project/submodule");
    const resolveBranch = vi.fn(async () => "feature/submodule");
    const resolveWorktreeStatus = vi.fn(() => ({
      repoRoot: "/tmp/project",
      worktreePath: "/tmp/project",
      branch: "main",
      worktreeDirty: true,
      worktreeLocked: true,
      worktreeLockOwner: "codex",
      worktreeLockReason: "mismatch",
      worktreeMerged: false,
    }));
    const updatePaneOutputState = vi.fn(async () => ({
      outputAt: "2024-01-01T00:00:00.000Z",
      hookState: null,
      inputTouchedAt: null,
    }));

    const detail = await processPane(
      {
        pane: { ...basePane, currentPath: "/tmp/project/submodule" },
        config: baseConfig,
        paneStates: { get: () => createPaneState() },
        paneLogManager: createPaneLogManager(),
        capturePaneFingerprint: vi.fn(async () => null),
        applyRestored: vi.fn(() => null),
        getCustomTitle: vi.fn(() => null),
        resolveRepoRoot,
        resolveWorktreeStatus,
        resolveBranch,
      },
      {
        resolvePaneAgent: vi.fn(async () => ({ agent: "codex" as const, ignore: false })),
        updatePaneOutputState,
      },
    );

    expect(detail?.repoRoot).toBe("/tmp/project/submodule");
    expect(detail?.branch).toBe("feature/submodule");
    expect(detail?.worktreePath).toBeNull();
    expect(detail?.worktreeDirty).toBeNull();
    expect(resolveBranch).toHaveBeenCalledWith("/tmp/project/submodule");
  });

  it("caches pipe tag as attached when auto attach succeeds", async () => {
    const cachePanePipeTagValue = vi.fn();
    const resolvePanePipeTagValue = vi.fn(async () => null);
    const updatePaneOutputState = vi.fn(async () => ({
      outputAt: "2024-01-01T00:00:00.000Z",
      hookState: null,
      inputTouchedAt: null,
    }));

    await processPane(
      {
        pane: { ...basePane, pipeTagValue: null, panePipe: false },
        config: baseConfig,
        paneStates: { get: () => createPaneState() },
        paneLogManager: createPaneLogManager({
          preparePaneLogging: vi.fn(async () => ({
            pipeAttached: true,
            pipeConflict: false,
            logPath: "/tmp/log",
          })),
        }),
        capturePaneFingerprint: vi.fn(async () => null),
        applyRestored: vi.fn(() => null),
        getCustomTitle: vi.fn(() => null),
        resolveRepoRoot: vi.fn(async () => null),
        resolvePanePipeTagValue,
        cachePanePipeTagValue,
      },
      {
        resolvePaneAgent: vi.fn(async () => ({ agent: "codex" as const, ignore: false })),
        updatePaneOutputState,
      },
    );

    expect(resolvePanePipeTagValue).toHaveBeenCalled();
    expect(cachePanePipeTagValue).toHaveBeenCalledWith("%1", "1");
  });

  it("allows fingerprint capture for non-agent pane only when recently viewed", async () => {
    const updatePaneOutputState = vi.fn(async () => ({
      outputAt: "2024-01-01T00:00:00.000Z",
      hookState: null,
      inputTouchedAt: null,
    }));

    await processPane(
      {
        pane: basePane,
        config: baseConfig,
        paneStates: { get: () => createPaneState() },
        paneLogManager: createPaneLogManager(),
        capturePaneFingerprint: vi.fn(async () => null),
        applyRestored: vi.fn(() => null),
        getCustomTitle: vi.fn(() => null),
        resolveRepoRoot: vi.fn(async () => null),
        isPaneViewedRecently: vi.fn(() => true),
      },
      {
        resolvePaneAgent: vi.fn(async () => ({ agent: "unknown" as const, ignore: false })),
        updatePaneOutputState,
      },
    );

    expect(updatePaneOutputState).toHaveBeenCalledWith(
      expect.objectContaining({
        isAgentPane: false,
        deps: expect.objectContaining({
          allowFingerprintCapture: true,
        }),
      }),
    );
  });

  it("reflects lastInputAt updated inside output updater", async () => {
    const paneState = createPaneState();
    const updatePaneOutputState = vi.fn(
      async ({ paneState: runtimeState }: { paneState: PaneRuntimeState }) => {
        runtimeState.lastInputAt = "2024-01-05T00:00:00.000Z";
        return {
          outputAt: "2024-01-05T00:00:00.000Z",
          hookState: null,
          inputTouchedAt: "2024-01-05T00:00:00.000Z",
        };
      },
    );

    const detail = await processPane(
      {
        pane: basePane,
        config: baseConfig,
        paneStates: { get: () => paneState },
        paneLogManager: createPaneLogManager(),
        capturePaneFingerprint: vi.fn(async () => null),
        applyRestored: vi.fn(() => null),
        getCustomTitle: vi.fn(() => null),
        resolveRepoRoot: vi.fn(async () => null),
      },
      {
        resolvePaneAgent: vi.fn(async () => ({ agent: "codex" as const, ignore: false })),
        updatePaneOutputState,
      },
    );

    expect(detail?.lastInputAt).toBe("2024-01-05T00:00:00.000Z");
  });
});
