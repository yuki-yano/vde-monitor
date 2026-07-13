import type { SessionDetail } from "@vde-monitor/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  renameSync: vi.fn(),
  unlinkSync: vi.fn(),
  openSync: vi.fn(() => 42),
  fsyncSync: vi.fn(),
  closeSync: vi.fn(),
  mkdirSync: vi.fn(),
  homedir: vi.fn(() => "/mock/home"),
}));

vi.mock("node:fs", () => ({
  default: {
    readFileSync: mocks.readFileSync,
    writeFileSync: mocks.writeFileSync,
    renameSync: mocks.renameSync,
    unlinkSync: mocks.unlinkSync,
    openSync: mocks.openSync,
    fsyncSync: mocks.fsyncSync,
    closeSync: mocks.closeSync,
    mkdirSync: mocks.mkdirSync,
  },
  readFileSync: mocks.readFileSync,
  writeFileSync: mocks.writeFileSync,
  renameSync: mocks.renameSync,
  unlinkSync: mocks.unlinkSync,
  openSync: mocks.openSync,
  fsyncSync: mocks.fsyncSync,
  closeSync: mocks.closeSync,
  mkdirSync: mocks.mkdirSync,
}));

vi.mock("node:os", () => ({
  default: { homedir: mocks.homedir },
  homedir: mocks.homedir,
}));

import {
  type PersistedCompletionCursor,
  type PersistedSessionRuntimeState,
  restorePersistedState,
  saveState,
} from "./state-store";

const statePath = "/mock/home/.vde-monitor/state.json";

const fileContents = new Map<string, string>();

const createSessionDetail = (overrides: Partial<SessionDetail> = {}): SessionDetail => ({
  paneId: "pane-1",
  sessionId: "session",
  sessionName: "session",
  windowId: "window-0",
  windowIndex: 0,
  paneIndex: 0,
  paneActive: true,
  currentCommand: null,
  currentPath: "/tmp",
  paneTty: "tty1",
  title: null,
  customTitle: null,
  repoRoot: null,
  agent: "codex",
  state: "RUNNING",
  stateReason: "reason",
  lastMessage: null,
  lastOutputAt: null,
  lastEventAt: null,
  lastInputAt: null,
  paneDead: false,
  alternateOn: false,
  pipeAttached: false,
  pipeConflict: false,
  startCommand: null,
  panePid: null,
  completion: null,
  ...overrides,
});

const createRuntimeState = (
  overrides: Partial<PersistedSessionRuntimeState> = {},
): PersistedSessionRuntimeState => ({
  lifecycle: "RUNNING",
  completionCursor: null,
  lastAgent: "codex",
  ...overrides,
});

const createRuntimeStateMap = (overrides: Partial<PersistedSessionRuntimeState> = {}) =>
  new Map([["pane-1", createRuntimeState(overrides)]]);

beforeEach(() => {
  vi.clearAllMocks();
  fileContents.clear();

  mocks.readFileSync.mockImplementation((targetPath: unknown) => {
    if (typeof targetPath !== "string") {
      throw new Error("unexpected path type");
    }
    const raw = fileContents.get(targetPath);
    if (raw == null) {
      const error = new Error(`ENOENT: ${targetPath}`) as NodeJS.ErrnoException;
      error.code = "ENOENT";
      throw error;
    }
    return raw;
  });

  mocks.writeFileSync.mockImplementation((targetPath: unknown, data: unknown) => {
    if (typeof targetPath !== "string" || typeof data !== "string") {
      throw new Error("unexpected write args");
    }
    fileContents.set(targetPath, data);
  });

  mocks.renameSync.mockImplementation((sourcePath: unknown, targetPath: unknown) => {
    if (typeof sourcePath !== "string" || typeof targetPath !== "string") {
      throw new Error("unexpected rename args");
    }
    const raw = fileContents.get(sourcePath);
    if (raw == null) {
      throw new Error(`ENOENT: ${sourcePath}`);
    }
    fileContents.delete(sourcePath);
    fileContents.set(targetPath, raw);
  });

  mocks.unlinkSync.mockImplementation((targetPath: unknown) => {
    if (typeof targetPath === "string") {
      fileContents.delete(targetPath);
    }
  });

  mocks.mkdirSync.mockImplementation(() => undefined);
});

describe("state-store timeline persistence", () => {
  it("returns empty state only when state.json does not exist", () => {
    const restored = restorePersistedState();

    expect(restored.sessions.size).toBe(0);
    expect(restored.timeline.size).toBe(0);
    expect(restored.repoNotes.size).toBe(0);
  });

  it("saves and restores timeline events", () => {
    saveState([createSessionDetail()], {
      runtimeStateByPaneId: createRuntimeStateMap(),
      timeline: {
        "pane-1": [
          {
            id: "pane-1:1700000000000:1",
            paneId: "pane-1",
            state: "DONE",
            reason: "completion:pending",
            repoRoot: "/repo/a",
            startedAt: "2026-02-07T00:00:00.000Z",
            endedAt: null,
            source: "view",
          },
        ],
      },
    });

    const parsed = JSON.parse(fileContents.get(statePath) ?? "{}");
    expect(parsed.version).toBe(3);
    expect(parsed.sessions["pane-1"].lifecycle).toBe("RUNNING");
    expect(parsed.sessions["pane-1"].state).toBeUndefined();
    expect(parsed.timeline["pane-1"]).toHaveLength(1);

    const { sessions: restoredSessions, timeline: restoredTimeline } = restorePersistedState();
    expect(restoredSessions.get("pane-1")?.paneId).toBe("pane-1");

    expect(restoredTimeline.get("pane-1")).toHaveLength(1);
    expect(restoredTimeline.get("pane-1")?.[0]?.id).toBe("pane-1:1700000000000:1");
    expect(restoredTimeline.get("pane-1")?.[0]?.repoRoot).toBe("/repo/a");
    expect(restoredTimeline.get("pane-1")?.[0]).toMatchObject({
      state: "DONE",
      source: "view",
    });
  });

  it("restores sessions/timeline/repoNotes from a single read", () => {
    saveState([createSessionDetail()], {
      runtimeStateByPaneId: createRuntimeStateMap(),
      timeline: {
        "pane-1": [
          {
            id: "pane-1:1700000000000:1",
            paneId: "pane-1",
            state: "RUNNING",
            reason: "poll",
            startedAt: "2026-02-07T00:00:00.000Z",
            endedAt: null,
            source: "poll",
          },
        ],
      },
      repoNotes: {
        "/repo/a": [
          {
            id: "note-1",
            repoRoot: "/repo/a",
            title: "todo",
            body: "update tests",
            createdAt: "2026-02-07T00:00:00.000Z",
            updatedAt: "2026-02-07T00:00:00.000Z",
          },
        ],
      },
    });
    mocks.readFileSync.mockClear();

    const restored = restorePersistedState();

    expect(mocks.readFileSync).toHaveBeenCalledTimes(1);
    expect(restored.sessions.get("pane-1")?.paneId).toBe("pane-1");
    expect(restored.timeline.get("pane-1")).toHaveLength(1);
    expect(restored.repoNotes.get("/repo/a")).toHaveLength(1);
  });

  it("saves and restores repository notes", () => {
    saveState([createSessionDetail()], {
      runtimeStateByPaneId: createRuntimeStateMap(),
      repoNotes: {
        "/repo/a": [
          {
            id: "note-1",
            repoRoot: "/repo/a",
            title: "todo",
            body: "update tests",
            createdAt: "2026-02-07T00:00:00.000Z",
            updatedAt: "2026-02-07T00:00:00.000Z",
          },
        ],
      },
    });

    const parsed = JSON.parse(fileContents.get(statePath) ?? "{}");
    expect(parsed.repoNotes["/repo/a"]).toHaveLength(1);

    const { repoNotes: restoredRepoNotes } = restorePersistedState();
    expect(restoredRepoNotes.get("/repo/a")).toHaveLength(1);
    expect(restoredRepoNotes.get("/repo/a")?.[0]?.id).toBe("note-1");
  });

  it("roundtrips repository activity without coupling it to session persistence", () => {
    const repositoryActivity = {
      trackingStartedAt: "2026-07-10T00:00:00.000Z",
      savedAt: "2026-07-10T00:01:00.000Z",
      intervals: [
        {
          id: "%1:1783641600000:1",
          paneId: "%1",
          repoRoot: "/repo/a",
          runId: "epoch-a:1",
          startedAt: "2026-07-10T00:00:00.000Z",
          endedAt: null,
        },
      ],
      completedRuns: [
        {
          epoch: "epoch-a",
          runSeq: 1,
          repoRoot: "/repo/a",
          completedAt: "2026-07-10T00:00:30.000Z",
        },
      ],
      gaps: [],
    };
    saveState([createSessionDetail()], {
      runtimeStateByPaneId: createRuntimeStateMap(),
      repositoryActivity,
    });

    const parsed = JSON.parse(fileContents.get(statePath) ?? "{}");
    expect(parsed.repositoryActivity).toEqual(repositoryActivity);
    expect(restorePersistedState().repositoryActivity).toEqual(repositoryActivity);
  });

  it("reports an incompatible persisted schema instead of silently discarding it", () => {
    fileContents.set(
      statePath,
      `${JSON.stringify(
        {
          version: 2,
          savedAt: "2026-02-07T00:00:00.000Z",
          sessions: {
            "pane-1": {
              paneId: "pane-1",
              lastOutputAt: null,
              lastEventAt: null,
              lastMessage: null,
              lastInputAt: null,
              customTitle: null,
              state: "RUNNING",
              stateReason: "reason",
            },
          },
          timeline: {},
          repoNotes: {},
        },
        null,
        2,
      )}\n`,
    );

    expect(() => restorePersistedState()).toThrow("persisted state is corrupt: invalid schema");
  });

  it("reports invalid JSON instead of silently starting with empty state", () => {
    fileContents.set(statePath, "{broken");

    expect(() => restorePersistedState()).toThrow("persisted state is corrupt: invalid JSON");
  });

  it.each([
    [
      "session",
      (state: Record<string, unknown>) => {
        (state.sessions as Record<string, unknown>)["pane-1"] = { paneId: "pane-1" };
      },
    ],
    [
      "timeline",
      (state: Record<string, unknown>) => {
        (state.timeline as Record<string, unknown>)["pane-1"] = [{ paneId: "pane-1" }];
      },
    ],
    [
      "repo note",
      (state: Record<string, unknown>) => {
        (state.repoNotes as Record<string, unknown>)["/repo/a"] = [{ repoRoot: "/repo/a" }];
      },
    ],
  ])("reports a corrupt nested %s instead of silently dropping it", (_label, corrupt) => {
    saveState([createSessionDetail()], {
      runtimeStateByPaneId: createRuntimeStateMap(),
      timeline: {},
      repoNotes: {},
    });
    const state = JSON.parse(fileContents.get(statePath) ?? "{}") as Record<string, unknown>;
    corrupt(state);
    fileContents.set(statePath, JSON.stringify(state));

    expect(() => restorePersistedState()).toThrow("persisted state is corrupt: invalid schema");
  });

  it("atomically replaces state.json through a temporary file", () => {
    saveState([createSessionDetail()], {
      runtimeStateByPaneId: createRuntimeStateMap(),
    });

    expect(mocks.writeFileSync).toHaveBeenCalledWith(
      expect.stringMatching(/\/\.state\.json\.\d+\..+\.tmp$/),
      expect.any(String),
      expect.objectContaining({ mode: 0o600 }),
    );
    expect(mocks.renameSync).toHaveBeenCalledWith(expect.stringContaining(".tmp"), statePath);
    expect(mocks.openSync).toHaveBeenCalledWith(expect.stringContaining(".tmp"), "r");
    expect(mocks.fsyncSync).toHaveBeenCalledWith(42);
    expect(mocks.closeSync).toHaveBeenCalledWith(42);
    expect(fileContents.has(statePath)).toBe(true);
  });

  it("restores a version 3 timeline event without repoRoot", () => {
    fileContents.set(
      statePath,
      `${JSON.stringify(
        {
          version: 3,
          savedAt: "2026-02-07T00:00:00.000Z",
          sessions: {
            "pane-1": {
              paneId: "pane-1",
              lastOutputAt: null,
              lastEventAt: null,
              lastMessage: null,
              lastInputAt: null,
              customTitle: null,
              lifecycle: "RUNNING",
              completionCursor: null,
              lastAgent: "codex",
              stateReason: "reason",
            },
          },
          timeline: {
            "pane-1": [
              {
                id: "pane-1:1700000000000:1",
                paneId: "pane-1",
                state: "RUNNING",
                reason: "poll",
                startedAt: "2026-02-07T00:00:00.000Z",
                endedAt: null,
                source: "poll",
              },
            ],
          },
          repoNotes: {},
        },
        null,
        2,
      )}\n`,
    );

    const { timeline: restoredTimeline } = restorePersistedState();
    expect(restoredTimeline.get("pane-1")).toHaveLength(1);
    expect(restoredTimeline.get("pane-1")?.[0]?.repoRoot).toBeUndefined();
  });

  it("roundtrips the completion cursor, identity timestamp, and last agent", () => {
    const completionCursor: PersistedCompletionCursor = {
      epoch: "epoch-1",
      paneInstanceKey: "pane-instance-1",
      agent: "codex",
      agentSessionId: "session-1",
      identityConfirmedAt: "2026-07-10T00:00:00.000Z",
      agentPresent: false,
      syntheticCompletionArmed: false,
      consecutiveAbsentObservations: 2,
      runSeq: 3,
      openRunSeq: null,
      completedSeq: 3,
      acknowledgedSeq: 2,
    };

    saveState([createSessionDetail({ state: "WAITING_INPUT" })], {
      runtimeStateByPaneId: createRuntimeStateMap({
        lifecycle: "WAITING_INPUT",
        completionCursor,
        lastAgent: "codex",
      }),
    });

    const parsed = JSON.parse(fileContents.get(statePath) ?? "{}");
    expect(parsed.sessions["pane-1"]).toMatchObject({
      lifecycle: "WAITING_INPUT",
      lastAgent: "codex",
      completionCursor: {
        epoch: "epoch-1",
        identityConfirmedAt: "2026-07-10T00:00:00.000Z",
        completedSeq: 3,
        acknowledgedSeq: 2,
      },
    });

    const restored = restorePersistedState().sessions.get("pane-1");
    expect(restored?.lifecycle).toBe("WAITING_INPUT");
    expect(restored?.lastAgent).toBe("codex");
    expect(restored?.completionCursor).toEqual(completionCursor);
  });

  it("retains a cold-restored cursor when no pane has committed yet", () => {
    const completionCursor: PersistedCompletionCursor = {
      epoch: "cold-epoch",
      paneInstanceKey: "pane-instance-1",
      agent: "codex",
      agentSessionId: "session-1",
      identityConfirmedAt: "2026-07-10T00:00:00.000Z",
      agentPresent: true,
      syntheticCompletionArmed: false,
      consecutiveAbsentObservations: 0,
      runSeq: 1,
      openRunSeq: null,
      completedSeq: 1,
      acknowledgedSeq: 0,
    };
    saveState([createSessionDetail({ state: "DONE" })], {
      runtimeStateByPaneId: createRuntimeStateMap({
        lifecycle: "WAITING_INPUT",
        completionCursor,
        lastAgent: "codex",
      }),
    });
    const retainedSessions = restorePersistedState().sessions;

    saveState([], {
      runtimeStateByPaneId: new Map(),
      retainedSessions,
    });

    const restoredAgain = restorePersistedState().sessions.get("pane-1");
    expect(restoredAgain).toMatchObject({
      lifecycle: "WAITING_INPUT",
      lastAgent: "codex",
      completionCursor: {
        epoch: "cold-epoch",
        completedSeq: 1,
        acknowledgedSeq: 0,
      },
    });
  });

  it("requires explicit canonical runtime state for every saved session", () => {
    expect(() =>
      saveState([createSessionDetail()], {
        runtimeStateByPaneId: new Map(),
      }),
    ).toThrow("missing persisted runtime state for pane pane-1");
    expect(mocks.writeFileSync).not.toHaveBeenCalled();
  });

  it("reports an invalid version 3 session instead of partially restoring the file", () => {
    const completionCursor: PersistedCompletionCursor = {
      epoch: "epoch-1",
      paneInstanceKey: "pane-instance-1",
      agent: "codex",
      agentSessionId: "session-1",
      identityConfirmedAt: "2026-07-10T00:00:00.000Z",
      agentPresent: true,
      syntheticCompletionArmed: false,
      consecutiveAbsentObservations: 0,
      runSeq: 1,
      openRunSeq: null,
      completedSeq: 1,
      acknowledgedSeq: 0,
    };
    saveState([createSessionDetail()], {
      runtimeStateByPaneId: createRuntimeStateMap({ completionCursor }),
    });
    const persisted = JSON.parse(fileContents.get(statePath) ?? "{}");
    persisted.sessions["pane-1"].completionCursor.identityConfirmedAt = "invalid";
    persisted.sessions["pane-2"] = {
      ...persisted.sessions["pane-1"],
      paneId: "pane-2",
      completionCursor: null,
    };
    persisted.timeline["pane-2"] = [
      {
        id: "pane-2:1700000000000:1",
        paneId: "pane-2",
        state: "RUNNING",
        reason: "poll",
        startedAt: "2026-07-10T00:00:00.000Z",
        endedAt: null,
        source: "poll",
      },
    ];
    persisted.repoNotes["/repo/a"] = [
      {
        id: "note-1",
        repoRoot: "/repo/a",
        title: null,
        body: "keep",
        createdAt: "2026-07-10T00:00:00.000Z",
        updatedAt: "2026-07-10T00:00:00.000Z",
      },
    ];
    fileContents.set(statePath, `${JSON.stringify(persisted, null, 2)}\n`);

    expect(() => restorePersistedState()).toThrow("persisted state is corrupt: invalid schema");
  });
});
