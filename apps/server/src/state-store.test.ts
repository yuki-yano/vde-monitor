import type { SessionDetail } from "@vde-monitor/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  homedir: vi.fn(() => "/mock/home"),
}));

vi.mock("node:fs", () => ({
  default: {
    readFileSync: mocks.readFileSync,
    writeFileSync: mocks.writeFileSync,
    mkdirSync: mocks.mkdirSync,
  },
  readFileSync: mocks.readFileSync,
  writeFileSync: mocks.writeFileSync,
  mkdirSync: mocks.mkdirSync,
}));

vi.mock("node:os", () => ({
  default: { homedir: mocks.homedir },
  homedir: mocks.homedir,
}));

import {
  restorePersistedState,
  restoreRepoNotes,
  restoreSessions,
  restoreTimeline,
  saveState,
} from "./state-store";

const statePath = "/mock/home/.vde-monitor/state.json";

const fileContents = new Map<string, string>();

const createSessionDetail = (overrides: Partial<SessionDetail> = {}): SessionDetail => ({
  paneId: "pane-1",
  sessionName: "session",
  windowIndex: 0,
  paneIndex: 0,
  windowActivity: null,
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
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  fileContents.clear();

  mocks.readFileSync.mockImplementation((targetPath: unknown) => {
    if (typeof targetPath !== "string") {
      throw new Error("unexpected path type");
    }
    const raw = fileContents.get(targetPath);
    if (raw == null) {
      throw new Error(`ENOENT: ${targetPath}`);
    }
    return raw;
  });

  mocks.writeFileSync.mockImplementation((targetPath: unknown, data: unknown) => {
    if (typeof targetPath !== "string" || typeof data !== "string") {
      throw new Error("unexpected write args");
    }
    fileContents.set(targetPath, data);
  });

  mocks.mkdirSync.mockImplementation(() => undefined);
});

describe("state-store timeline persistence", () => {
  it("saves and restores timeline events", () => {
    saveState([createSessionDetail()], {
      timeline: {
        "pane-1": [
          {
            id: "pane-1:1700000000000:1",
            paneId: "pane-1",
            state: "RUNNING",
            reason: "poll",
            repoRoot: "/repo/a",
            startedAt: "2026-02-07T00:00:00.000Z",
            endedAt: null,
            source: "poll",
          },
        ],
      },
    });

    const parsed = JSON.parse(fileContents.get(statePath) ?? "{}");
    expect(parsed.version).toBe(2);
    expect(parsed.timeline["pane-1"]).toHaveLength(1);

    const restoredSessions = restoreSessions();
    expect(restoredSessions.get("pane-1")?.paneId).toBe("pane-1");

    const restoredTimeline = restoreTimeline();
    expect(restoredTimeline.get("pane-1")).toHaveLength(1);
    expect(restoredTimeline.get("pane-1")?.[0]?.id).toBe("pane-1:1700000000000:1");
    expect(restoredTimeline.get("pane-1")?.[0]?.repoRoot).toBe("/repo/a");
  });

  it("restores sessions/timeline/repoNotes from a single read", () => {
    saveState([createSessionDetail()], {
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

    const restoredRepoNotes = restoreRepoNotes();
    expect(restoredRepoNotes.get("/repo/a")).toHaveLength(1);
    expect(restoredRepoNotes.get("/repo/a")?.[0]?.id).toBe("note-1");
  });

  it("returns empty state for unsupported format", () => {
    fileContents.set(
      statePath,
      `${JSON.stringify(
        {
          version: 1,
          savedAt: "2026-02-07T00:00:00.000Z",
          sessions: {},
        },
        null,
        2,
      )}\n`,
    );

    const restoredSessions = restoreSessions();
    const restoredTimeline = restoreTimeline();
    const restoredRepoNotes = restoreRepoNotes();
    expect(restoredSessions.size).toBe(0);
    expect(restoredTimeline.size).toBe(0);
    expect(restoredRepoNotes.size).toBe(0);
  });

  it("restores legacy timeline event without repoRoot", () => {
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

    const restoredTimeline = restoreTimeline();
    expect(restoredTimeline.get("pane-1")).toHaveLength(1);
    expect(restoredTimeline.get("pane-1")?.[0]?.repoRoot).toBeUndefined();
  });
});
