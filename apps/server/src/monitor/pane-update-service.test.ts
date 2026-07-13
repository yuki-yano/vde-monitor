import type { AgentMonitorConfig, PaneMeta } from "@vde-monitor/multiplexer";
import { type SessionDetail, configDefaults } from "@vde-monitor/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createSessionRegistry } from "../session-registry";
import { createPaneStateStore } from "./pane-state";
import { createPaneUpdateService } from "./pane-update-service";

const processPaneMock = vi.hoisted(() => vi.fn());
const createAgentProcessSnapshotMock = vi.hoisted(() => vi.fn());

const createPaneLogManagerMock = () => ({
  detachOwnedPipe: vi.fn(async () => ({ ok: true, owned: false, detached: false })),
  getOwnedPaneIds: vi.fn((): string[] => []),
});

vi.mock("./pane-processor", () => ({
  processPane: processPaneMock,
}));

vi.mock("./agent-resolver-process", () => ({
  createAgentProcessSnapshot: createAgentProcessSnapshotMock,
}));

vi.mock("./repo-root", () => ({
  resolveRepoRootCached: vi.fn(async () => "/repo/default"),
}));

vi.mock("./vw-worktree", () => ({
  resolveVwWorktreeSnapshotCached: vi.fn(async () => null),
  resolveWorktreeStatusFromSnapshot: vi.fn(() => null),
}));

const basePane: PaneMeta = {
  paneId: "%1",
  sessionId: "$1",
  sessionName: "session",
  windowId: "@0",
  windowIndex: 0,
  paneIndex: 0,
  windowActivity: null,
  paneActivity: null,
  paneActive: true,
  currentCommand: "codex",
  currentPath: "/repo/default",
  paneTty: "/dev/ttys001",
  paneDead: false,
  panePipe: false,
  alternateOn: false,
  panePid: 100,
  paneTitle: null,
  paneStartCommand: "codex",
  pipeTagValue: "0",
};

const createDetail = (overrides: Partial<SessionDetail> = {}): SessionDetail => ({
  paneId: "%1",
  sessionId: "$1",
  sessionName: "session",
  windowId: "@0",
  windowIndex: 0,
  paneIndex: 0,
  paneActive: true,
  currentCommand: "codex",
  currentPath: "/repo/default",
  paneTty: "/dev/ttys001",
  title: null,
  customTitle: null,
  branch: null,
  worktreePath: null,
  worktreeDirty: null,
  worktreeLocked: null,
  worktreeLockOwner: null,
  worktreeLockReason: null,
  worktreeMerged: null,
  repoRoot: "/repo/default",
  agent: "codex",
  state: "RUNNING",
  stateReason: "hook:PreToolUse",
  lastMessage: null,
  lastOutputAt: null,
  lastEventAt: "2026-02-25T00:00:00.000Z",
  lastInputAt: null,
  paneDead: false,
  alternateOn: false,
  pipeAttached: false,
  pipeConflict: false,
  startCommand: "codex",
  panePid: 100,
  completion: null,
  ...overrides,
});

describe("createPaneUpdateService", () => {
  const config: AgentMonitorConfig = { ...configDefaults, token: "test-token" };

  beforeEach(() => {
    vi.clearAllMocks();
    createAgentProcessSnapshotMock.mockResolvedValue({
      status: "success",
      processByPid: new Map(),
      childrenByParentPid: new Map(),
      processesByTty: new Map(),
    });
  });

  const createService = () => {
    const paneStates = createPaneStateStore();
    const registry = createSessionRegistry();
    const stateTimeline = {
      record: vi.fn(),
      closePane: vi.fn(),
    };
    const repositoryActivity = {
      observePane: vi.fn(),
      closePane: vi.fn(),
      recordCompletedRun: vi.fn(),
      recordCoverageGap: vi.fn(),
    };
    const inspector = {
      listPanes: vi.fn(async () => [basePane]),
      readUserOption: vi.fn(async () => null),
    };
    const savePersistedState = vi.fn();
    const detachOwnedPipe = vi.fn(async () => ({ ok: true, owned: true, detached: true }));
    const getOwnedPaneIds = vi.fn((): string[] => []);
    const onPaneInventory = vi.fn();
    const onPaneObservationCommitted = vi.fn();
    const observePaneMetadata = vi.fn();
    const removePaneObservation = vi.fn();
    const service = createPaneUpdateService({
      inspector,
      serverKey: "test-server",
      config,
      paneStates,
      paneLogManager: { detachOwnedPipe, getOwnedPaneIds } as never,
      capturePaneFingerprint: vi.fn(async () => null),
      getCustomTitle: vi.fn(() => null),
      customTitles: new Map(),
      registry,
      stateTimeline,
      repositoryActivity,
      logActivity: { unregister: vi.fn() },
      savePersistedState,
      observePaneMetadata,
      removePaneObservation,
      onPaneInventory,
      onPaneObservationCommitted,
    });
    return {
      service,
      stateTimeline,
      repositoryActivity,
      paneStates,
      registry,
      savePersistedState,
      inspector,
      detachOwnedPipe,
      getOwnedPaneIds,
      onPaneInventory,
      onPaneObservationCommitted,
      observePaneMetadata,
      removePaneObservation,
    };
  };

  it("acknowledges and clamps the current completion generation through the view commit path", () => {
    const { service, stateTimeline, paneStates, registry, savePersistedState } = createService();
    registry.update(
      createDetail({
        state: "DONE",
        completion: { epoch: "epoch-1", completedSeq: 2, acknowledgedSeq: 0 },
      }),
    );
    const state = paneStates.get("%1");
    state.lifecycle = "WAITING_INPUT";
    state.completionCursor = {
      epoch: "epoch-1",
      paneInstanceKey: null,
      agent: "codex",
      agentSessionId: null,
      identityConfirmedAt: null,
      agentPresent: true,
      syntheticCompletionArmed: false,
      consecutiveAbsentObservations: 0,
      runSeq: 2,
      openRunSeq: null,
      completedSeq: 2,
      acknowledgedSeq: 0,
    };

    const stale = service.acknowledgeView({
      paneId: "%1",
      epoch: "stale",
      throughSeq: 99,
    });
    expect(stale?.state).toBe("DONE");

    const acknowledged = service.acknowledgeView({
      paneId: "%1",
      epoch: "epoch-1",
      throughSeq: 99,
    });
    expect(acknowledged).toMatchObject({
      state: "WAITING_INPUT",
      completion: { completedSeq: 2, acknowledgedSeq: 2 },
    });
    expect(stateTimeline.record).toHaveBeenCalledWith(
      expect.objectContaining({ source: "view", state: "WAITING_INPUT" }),
    );
    expect(registry.getDetail("%1")?.state).toBe("WAITING_INPUT");
    expect(savePersistedState).toHaveBeenCalledTimes(2);
  });

  it("records transition when repoRoot changes with same state/reason", async () => {
    processPaneMock.mockResolvedValueOnce(createDetail({ repoRoot: "/repo/a" }));
    processPaneMock.mockResolvedValueOnce(createDetail({ repoRoot: "/repo/b" }));
    const { service, stateTimeline } = createService();

    await service.updateFromPanes();
    await service.updateFromPanes();

    expect(stateTimeline.record).toHaveBeenCalledTimes(2);
    expect(stateTimeline.record).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        paneId: "%1",
        state: "RUNNING",
        reason: "hook:PreToolUse",
        repoRoot: "/repo/a",
      }),
    );
    expect(stateTimeline.record).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        paneId: "%1",
        state: "RUNNING",
        reason: "hook:PreToolUse",
        repoRoot: "/repo/b",
      }),
    );
  });

  it("creates one process snapshot per update tick and shares it with pane processing", async () => {
    processPaneMock.mockResolvedValueOnce(createDetail());
    const { service } = createService();

    await service.updateFromPanes();

    expect(createAgentProcessSnapshotMock).toHaveBeenCalledOnce();
    expect(processPaneMock).toHaveBeenCalledWith(
      expect.objectContaining({
        processSnapshot: expect.objectContaining({ status: "success" }),
      }),
    );
  });

  it("does not add duplicate transition when state/reason/repoRoot are unchanged", async () => {
    processPaneMock.mockResolvedValue(createDetail({ repoRoot: "/repo/a" }));
    const { service, stateTimeline } = createService();

    await service.updateFromPanes();
    await service.updateFromPanes();

    expect(stateTimeline.record).toHaveBeenCalledTimes(1);
  });

  it("retains a cold-restored pane when processing rejects", async () => {
    processPaneMock
      .mockRejectedValueOnce(new Error("capture failed"))
      .mockResolvedValueOnce(createDetail());
    const {
      service,
      repositoryActivity,
      savePersistedState,
      onPaneInventory,
      onPaneObservationCommitted,
    } = createService();

    await service.updateFromPanes();

    expect(onPaneInventory).toHaveBeenCalledWith(["%1"]);
    expect(onPaneObservationCommitted).not.toHaveBeenCalled();
    expect(savePersistedState).toHaveBeenCalledOnce();
    expect(repositoryActivity.closePane).toHaveBeenCalledWith("%1");

    await service.updateFromPanes();
    expect(repositoryActivity.recordCoverageGap).toHaveBeenLastCalledWith({
      startedAt: expect.any(String),
      endedAt: expect.any(String),
    });
  });

  it("isolates a synchronous state commit failure to its pane", async () => {
    const secondPane: PaneMeta = {
      ...basePane,
      paneId: "%2",
      paneIndex: 1,
      panePid: 101,
    };
    processPaneMock
      .mockResolvedValueOnce(createDetail({ state: "DONE" }))
      .mockResolvedValueOnce(
        createDetail({ paneId: "%2", paneIndex: 1, panePid: 101, stateReason: "poll:running" }),
      );
    const {
      service,
      inspector,
      paneStates,
      registry,
      stateTimeline,
      savePersistedState,
      onPaneObservationCommitted,
    } = createService();
    inspector.listPanes.mockResolvedValueOnce([basePane, secondPane]);
    const failedPaneState = paneStates.get("%1");
    failedPaneState.pendingAgentLifecycleEvents.push({
      source: "hook",
      agent: "codex",
      eventName: "PreToolUse",
      sessionId: "session-1",
      at: "2026-07-10T00:00:00.000Z",
    });

    await expect(service.updateFromPanes()).resolves.toBeUndefined();

    expect(registry.getDetail("%1")).toBeNull();
    expect(registry.getDetail("%2")).toMatchObject({ state: "RUNNING" });
    expect(failedPaneState.pendingAgentLifecycleEvents).toHaveLength(1);
    expect(stateTimeline.record).toHaveBeenCalledTimes(1);
    expect(stateTimeline.record).toHaveBeenCalledWith(expect.objectContaining({ paneId: "%2" }));
    expect(onPaneObservationCommitted).toHaveBeenCalledTimes(1);
    expect(onPaneObservationCommitted).toHaveBeenCalledWith("%2");
    expect(savePersistedState).toHaveBeenCalledOnce();
  });

  it("forwards pane metadata and removes its observation when the pane disappears", async () => {
    processPaneMock.mockResolvedValueOnce(createDetail());
    const { service, inspector, observePaneMetadata, removePaneObservation } = createService();

    await service.updateFromPanes();
    expect(observePaneMetadata).toHaveBeenCalledWith(basePane);

    inspector.listPanes.mockResolvedValueOnce([]);
    await service.updateFromPanes();
    expect(removePaneObservation).toHaveBeenCalledWith("%1");
  });

  it("releases a retained restore after a successful ignored-pane observation", async () => {
    processPaneMock.mockResolvedValueOnce(null);
    const { service, onPaneObservationCommitted } = createService();

    await service.updateFromPanes();

    expect(onPaneObservationCommitted).toHaveBeenCalledWith("%1");
  });

  it("freshly checks and detaches owned pipe state when a pane is removed", async () => {
    processPaneMock.mockResolvedValueOnce(createDetail());
    const { service, inspector, detachOwnedPipe } = createService();

    await service.updateFromPanes();
    inspector.listPanes.mockResolvedValueOnce([]);
    await service.updateFromPanes();

    expect(detachOwnedPipe).toHaveBeenCalledWith("%1", { forceCheck: true });
  });

  it("cleans an owned pane tracked before it reached the session registry", async () => {
    processPaneMock.mockResolvedValueOnce(null);
    const { service, getOwnedPaneIds, detachOwnedPipe } = createService();
    getOwnedPaneIds.mockReturnValueOnce(["%orphan"]);

    await service.updateFromPanes();

    expect(detachOwnedPipe).toHaveBeenCalledWith("%orphan", { forceCheck: true });
  });

  it("uses last known pane activity time for notification events", async () => {
    processPaneMock.mockResolvedValueOnce(
      createDetail({
        state: "RUNNING",
        stateReason: "recent_output",
        lastOutputAt: "2026-02-25T00:00:00.000Z",
        lastEventAt: null,
      }),
    );
    processPaneMock.mockResolvedValueOnce(
      createDetail({
        state: "WAITING_INPUT",
        stateReason: "inactive_timeout",
        lastOutputAt: "2026-02-25T00:00:00.000Z",
        lastEventAt: null,
      }),
    );

    const paneStates = createPaneStateStore();
    const registry = createSessionRegistry();
    const stateTimeline = {
      record: vi.fn(),
      closePane: vi.fn(),
    };
    const inspector = {
      listPanes: vi.fn(async () => [basePane]),
      readUserOption: vi.fn(async () => null),
    };
    const onStateTransition = vi.fn();
    const service = createPaneUpdateService({
      inspector,
      serverKey: "test-server",
      config,
      paneStates,
      paneLogManager: createPaneLogManagerMock() as never,
      capturePaneFingerprint: vi.fn(async () => null),
      getCustomTitle: vi.fn(() => null),
      customTitles: new Map(),
      registry,
      stateTimeline,
      repositoryActivity: {
        observePane: vi.fn(),
        closePane: vi.fn(),
        recordCompletedRun: vi.fn(),
        recordCoverageGap: vi.fn(),
      },
      logActivity: { unregister: vi.fn() },
      savePersistedState: vi.fn(),
      onStateTransition,
    });

    await service.updateFromPanes();
    await service.updateFromPanes();

    expect(onStateTransition).toHaveBeenCalledWith(
      expect.objectContaining({
        at: "2026-02-25T00:00:00.000Z",
      }),
    );
  });

  it("persists completion commits after registry update and before notification dispatch", async () => {
    processPaneMock.mockResolvedValueOnce(
      createDetail({
        state: "WAITING_INPUT",
        stateReason: "hook:stop",
        agentSessionId: "session-1",
      }),
    );
    const order: string[] = [];
    const paneStates = createPaneStateStore();
    const paneState = paneStates.get("%1");
    paneState.agentPresence = "present";
    paneState.agentPresent = true;
    paneState.pendingAgentLifecycleEvents.push(
      {
        source: "hook",
        agent: "codex",
        eventName: "UserPromptSubmit",
        sessionId: "session-1",
        at: "2026-02-25T00:00:00.000Z",
      },
      {
        source: "hook",
        agent: "codex",
        eventName: "Stop",
        sessionId: "session-1",
        at: "2026-02-25T00:00:01.000Z",
      },
    );
    const registry = createSessionRegistry();
    const updateRegistry = registry.update.bind(registry);
    vi.spyOn(registry, "update").mockImplementation((session) => {
      order.push("registry");
      return updateRegistry(session);
    });
    const savePersistedState = vi.fn(() => {
      order.push("persist");
    });
    const onStateTransition = vi.fn((event) => {
      order.push(event.completionAdvanced ? "completion-notification" : "state-notification");
      expect(savePersistedState).toHaveBeenCalledOnce();
      expect(registry.getDetail("%1")?.state).toBe("DONE");
    });
    const repositoryActivity = {
      observePane: vi.fn(),
      closePane: vi.fn(),
      recordCompletedRun: vi.fn(),
      recordCoverageGap: vi.fn(),
    };
    const service = createPaneUpdateService({
      inspector: {
        listPanes: vi.fn(async () => [basePane]),
        readUserOption: vi.fn(async () => null),
      },
      serverKey: "test-server",
      config,
      paneStates,
      paneLogManager: createPaneLogManagerMock() as never,
      capturePaneFingerprint: vi.fn(async () => null),
      getCustomTitle: vi.fn(() => null),
      customTitles: new Map(),
      registry,
      stateTimeline: {
        record: vi.fn(() => {
          order.push("timeline");
        }),
        closePane: vi.fn(),
      },
      repositoryActivity,
      logActivity: { unregister: vi.fn() },
      savePersistedState,
      onStateTransition,
    });

    await service.updateFromPanes();

    expect(order).toEqual([
      "timeline",
      "registry",
      "persist",
      "state-notification",
      "completion-notification",
    ]);
    expect(repositoryActivity.recordCompletedRun).toHaveBeenCalledWith({
      epoch: expect.any(String),
      runSeq: 1,
      repoRoot: "/repo/default",
      source: "hook:stop",
      at: "2026-02-25T00:00:01.000Z",
    });
    expect(repositoryActivity.observePane).toHaveBeenNthCalledWith(1, {
      paneId: "%1",
      running: true,
      repoRoot: "/repo/default",
      runId: expect.stringMatching(/:1$/),
      verified: true,
      at: "2026-02-25T00:00:00.000Z",
    });
    expect(repositoryActivity.observePane).toHaveBeenNthCalledWith(2, {
      paneId: "%1",
      running: false,
      repoRoot: "/repo/default",
      runId: expect.stringMatching(/:1$/),
      verified: false,
      at: "2026-02-25T00:00:01.000Z",
    });
  });

  it("does not dispatch a completion notification when persistence fails", async () => {
    processPaneMock.mockResolvedValueOnce(createDetail());
    const onStateTransition = vi.fn();
    const service = createPaneUpdateService({
      inspector: {
        listPanes: vi.fn(async () => [basePane]),
        readUserOption: vi.fn(async () => null),
      },
      serverKey: "test-server",
      config,
      paneStates: createPaneStateStore(),
      paneLogManager: createPaneLogManagerMock() as never,
      capturePaneFingerprint: vi.fn(async () => null),
      getCustomTitle: vi.fn(() => null),
      customTitles: new Map(),
      registry: createSessionRegistry(),
      stateTimeline: { record: vi.fn(), closePane: vi.fn() },
      repositoryActivity: {
        observePane: vi.fn(),
        closePane: vi.fn(),
        recordCompletedRun: vi.fn(),
        recordCoverageGap: vi.fn(),
      },
      logActivity: { unregister: vi.fn() },
      savePersistedState: vi.fn(() => {
        throw new Error("persist failed");
      }),
      onStateTransition,
    });

    await expect(service.updateFromPanes()).rejects.toThrow("persist failed");
    expect(onStateTransition).not.toHaveBeenCalled();
  });

  it("shares in-flight pane pipe tag reads for the same pane", async () => {
    const paneWithPipe: PaneMeta = {
      ...basePane,
      panePipe: true,
      pipeTagValue: null,
    };
    let resolveRead: ((value: string | null) => void) | undefined;
    const readUserOptionPromise = new Promise<string | null>((resolve) => {
      resolveRead = resolve;
    });
    const inspector = {
      listPanes: vi.fn(async () => [paneWithPipe, paneWithPipe]),
      readUserOption: vi.fn(() => readUserOptionPromise),
    };
    processPaneMock.mockImplementation(async (args) => {
      const pipeTagValue = await args.resolvePanePipeTagValue(args.pane);
      return createDetail({ pipeAttached: pipeTagValue === "1" });
    });
    const service = createPaneUpdateService({
      inspector,
      serverKey: "test-server",
      config,
      paneStates: createPaneStateStore(),
      paneLogManager: createPaneLogManagerMock() as never,
      capturePaneFingerprint: vi.fn(async () => null),
      getCustomTitle: vi.fn(() => null),
      customTitles: new Map(),
      registry: createSessionRegistry(),
      stateTimeline: {
        record: vi.fn(),
        closePane: vi.fn(),
      },
      repositoryActivity: {
        observePane: vi.fn(),
        closePane: vi.fn(),
        recordCompletedRun: vi.fn(),
        recordCoverageGap: vi.fn(),
      },
      logActivity: { unregister: vi.fn() },
      savePersistedState: vi.fn(),
    });

    const updatePromise = service.updateFromPanes();
    await vi.waitFor(() => {
      expect(inspector.readUserOption).toHaveBeenCalledTimes(1);
    });
    resolveRead?.("1");
    await updatePromise;

    expect(inspector.readUserOption).toHaveBeenCalledWith("%1", "@vde-monitor_pipe");
    expect(processPaneMock).toHaveBeenCalledTimes(2);
  });
});
