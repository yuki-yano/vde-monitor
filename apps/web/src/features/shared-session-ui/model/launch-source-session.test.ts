import type { SessionSummary } from "@vde-monitor/shared";
import { describe, expect, it } from "vitest";

import { selectLaunchSourceSession } from "./launch-source-session";

const buildSession = (overrides: Partial<SessionSummary> = {}): SessionSummary => ({
  paneId: "%1",
  sessionName: "main",
  windowIndex: 0,
  paneIndex: 0,
  paneActive: false,
  currentCommand: null,
  currentPath: null,
  paneTty: null,
  title: null,
  customTitle: null,
  agent: "unknown",
  state: "UNKNOWN",
  stateReason: "no_signal",
  lastMessage: null,
  lastOutputAt: null,
  lastEventAt: null,
  lastInputAt: null,
  repoRoot: null,
  worktreePath: null,
  paneDead: false,
  alternateOn: false,
  pipeAttached: false,
  pipeConflict: false,
  completion: null,
  ...overrides,
});

describe("selectLaunchSourceSession", () => {
  it("prioritizes repoRoot-matching pane", () => {
    const sessions = [
      buildSession({
        paneId: "%1",
        repoRoot: "/repo/a",
        worktreePath: "/repo/a/.worktree/feature",
      }),
      buildSession({ paneId: "%2", repoRoot: "/repo/a", worktreePath: "/repo/a" }),
      buildSession({ paneId: "%3", paneActive: true }),
    ];

    expect(selectLaunchSourceSession(sessions)?.paneId).toBe("%2");
  });

  it("falls back to non-worktree pane", () => {
    const sessions = [
      buildSession({
        paneId: "%1",
        repoRoot: "/repo/a",
        worktreePath: "/repo/a/.worktree/feature",
      }),
      buildSession({ paneId: "%2", worktreePath: "/repo/a" }),
    ];

    expect(selectLaunchSourceSession(sessions)?.paneId).toBe("%2");
  });

  it("falls back to active pane then first pane", () => {
    const active = [
      buildSession({ paneId: "%1", worktreePath: "/repo/a/.worktree/feature-1" }),
      buildSession({ paneId: "%2", worktreePath: "/repo/a/.worktree/feature-2", paneActive: true }),
    ];
    expect(selectLaunchSourceSession(active)?.paneId).toBe("%2");

    const first = [
      buildSession({ paneId: "%1", worktreePath: "/repo/a/.worktree/feature-1" }),
      buildSession({ paneId: "%2", worktreePath: "/repo/a/.worktree/feature-2" }),
    ];
    expect(selectLaunchSourceSession(first)?.paneId).toBe("%1");
  });
});
