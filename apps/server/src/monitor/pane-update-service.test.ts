import {
  type AgentMonitorConfig,
  type PaneMeta,
  type SessionDetail,
  configDefaults,
} from "@vde-monitor/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createSessionRegistry } from "../session-registry";
import { createPaneStateStore } from "./pane-state";
import { createPaneUpdateService } from "./pane-update-service";

const processPaneMock = vi.hoisted(() => vi.fn());

vi.mock("./pane-processor", () => ({
  processPane: processPaneMock,
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
  sessionName: "session",
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
  sessionName: "session",
  windowIndex: 0,
  paneIndex: 0,
  windowActivity: null,
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
  ...overrides,
});

describe("createPaneUpdateService", () => {
  const config: AgentMonitorConfig = { ...configDefaults, token: "test-token" };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const createService = () => {
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
    const service = createPaneUpdateService({
      inspector,
      config,
      paneStates,
      paneLogManager: {} as never,
      capturePaneFingerprint: vi.fn(async () => null),
      applyRestored: vi.fn(() => null),
      getCustomTitle: vi.fn(() => null),
      customTitles: new Map(),
      registry,
      stateTimeline,
      logActivity: { unregister: vi.fn() },
      savePersistedState: vi.fn(),
    });
    return { service, stateTimeline };
  };

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

  it("does not add duplicate transition when state/reason/repoRoot are unchanged", async () => {
    processPaneMock.mockResolvedValue(createDetail({ repoRoot: "/repo/a" }));
    const { service, stateTimeline } = createService();

    await service.updateFromPanes();
    await service.updateFromPanes();

    expect(stateTimeline.record).toHaveBeenCalledTimes(1);
  });
});
