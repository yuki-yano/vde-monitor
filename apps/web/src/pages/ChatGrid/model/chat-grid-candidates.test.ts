import type { SessionSummary } from "@vde-monitor/shared";
import { describe, expect, it } from "vitest";

import { buildChatGridCandidates } from "./chat-grid-candidates";

const buildSession = (overrides: Partial<SessionSummary> = {}): SessionSummary => ({
  paneId: "pane-1",
  sessionName: "session-1",
  windowIndex: 1,
  paneIndex: 0,
  windowActivity: null,
  paneActive: true,
  currentCommand: null,
  currentPath: "/Users/test/repo",
  paneTty: null,
  title: "Session Title",
  customTitle: null,
  branch: "main",
  worktreePath: "/Users/test/repo",
  worktreeDirty: false,
  worktreeLocked: false,
  worktreeLockOwner: null,
  worktreeLockReason: null,
  worktreeMerged: false,
  repoRoot: "/Users/test/repo",
  agent: "codex",
  state: "RUNNING",
  stateReason: "ok",
  lastMessage: null,
  lastOutputAt: null,
  lastEventAt: null,
  lastInputAt: "2026-02-17T00:00:00.000Z",
  paneDead: false,
  alternateOn: false,
  pipeAttached: false,
  pipeConflict: false,
  ...overrides,
});

describe("buildChatGridCandidates", () => {
  it("returns all known-agent panes in SessionList-compatible order", () => {
    const running = buildSession({
      paneId: "pane-running",
      sessionName: "session-running",
      lastInputAt: "2026-02-17T00:01:00.000Z",
      state: "RUNNING",
      repoRoot: "/Users/test/repo-a",
    });
    const waiting = buildSession({
      paneId: "pane-waiting",
      sessionName: "session-waiting",
      lastInputAt: "2026-02-17T00:02:00.000Z",
      state: "WAITING_INPUT",
      repoRoot: "/Users/test/repo-b",
    });
    const shell = buildSession({
      paneId: "pane-shell",
      sessionName: "session-shell",
      lastInputAt: "2026-02-17T00:03:00.000Z",
      state: "SHELL",
      repoRoot: "/Users/test/repo-c",
    });
    const unknown = buildSession({
      paneId: "pane-unknown",
      sessionName: "session-unknown",
      lastInputAt: "2026-02-17T00:04:00.000Z",
      state: "UNKNOWN",
      repoRoot: "/Users/test/repo-d",
    });
    const unknownAgent = buildSession({
      paneId: "pane-unknown-agent",
      sessionName: "session-unknown-agent",
      agent: "unknown",
      lastInputAt: "2026-02-17T00:06:00.000Z",
      state: "RUNNING",
      repoRoot: "/Users/test/repo-g",
    });
    const noInput = buildSession({
      paneId: "pane-no-input",
      sessionName: "session-no-input",
      lastInputAt: null,
      state: "RUNNING",
      repoRoot: "/Users/test/repo-e",
    });
    const dead = buildSession({
      paneId: "pane-dead",
      sessionName: "session-dead",
      lastInputAt: "2026-02-17T00:05:00.000Z",
      state: "RUNNING",
      paneDead: true,
      repoRoot: "/Users/test/repo-f",
    });

    const candidates = buildChatGridCandidates({
      sessions: [running, waiting, shell, unknown, noInput, dead, unknownAgent],
    });

    expect(candidates.map((session) => session.paneId)).toEqual([
      "pane-dead",
      "pane-unknown",
      "pane-shell",
      "pane-waiting",
      "pane-running",
      "pane-no-input",
    ]);
  });

  it("keeps SessionList-compatible repo order via sort anchors", () => {
    const staleRepoPane = buildSession({
      paneId: "pane-stale",
      sessionName: "session-stale",
      repoRoot: "/Users/test/repo-stale",
      lastInputAt: "2026-02-17T00:00:00.000Z",
    });
    const freshRepoPane = buildSession({
      paneId: "pane-fresh",
      sessionName: "session-fresh",
      repoRoot: "/Users/test/repo-fresh",
      lastInputAt: "2026-02-17T00:10:00.000Z",
    });

    const candidates = buildChatGridCandidates({
      sessions: [staleRepoPane, freshRepoPane],
      getRepoSortAnchorAt: (repoRoot) =>
        repoRoot === "/Users/test/repo-stale" ? Date.parse("2026-02-17T01:00:00.000Z") : null,
    });

    expect(candidates.map((session) => session.paneId)).toEqual(["pane-stale", "pane-fresh"]);
  });

  it("returns all sorted panes", () => {
    const sessions = Array.from({ length: 8 }, (_, index) =>
      buildSession({
        paneId: `pane-${index + 1}`,
        sessionName: `session-${index + 1}`,
        lastInputAt: new Date(Date.parse("2026-02-17T00:00:00.000Z") + index * 1000).toISOString(),
      }),
    );

    const candidates = buildChatGridCandidates({ sessions });

    expect(candidates).toHaveLength(8);
  });
});
