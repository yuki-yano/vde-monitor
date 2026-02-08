import type { SessionSummary } from "@vde-monitor/shared";
import { describe, expect, it } from "vitest";

import { buildSessionWindowGroups } from "./session-window-group";

const buildSession = (overrides: Partial<SessionSummary>): SessionSummary => ({
  paneId: "%1",
  sessionName: "main",
  windowIndex: 0,
  paneIndex: 0,
  windowActivity: null,
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
  paneDead: false,
  alternateOn: false,
  pipeAttached: false,
  pipeConflict: false,
  ...overrides,
});

describe("buildSessionWindowGroups", () => {
  it("moves recently operated windows to the top within the same tmux session", () => {
    const groups = buildSessionWindowGroups([
      buildSession({
        paneId: "%1",
        sessionName: "alpha",
        windowIndex: 1,
        lastInputAt: "2026-02-07T10:00:00.000Z",
      }),
      buildSession({
        paneId: "%2",
        sessionName: "alpha",
        windowIndex: 2,
        lastInputAt: "2026-02-07T11:00:00.000Z",
      }),
      buildSession({
        paneId: "%3",
        sessionName: "beta",
        windowIndex: 3,
        lastInputAt: "2026-02-07T12:00:00.000Z",
      }),
    ]);

    expect(
      groups.filter((group) => group.sessionName === "alpha").map((group) => group.windowIndex),
    ).toEqual([2, 1]);
  });

  it("moves tmux sessions with newer input to the top", () => {
    const groups = buildSessionWindowGroups([
      buildSession({
        paneId: "%a1",
        sessionName: "alpha",
        windowIndex: 1,
        lastInputAt: "2026-02-07T10:00:00.000Z",
      }),
      buildSession({
        paneId: "%b1",
        sessionName: "beta",
        windowIndex: 1,
        lastInputAt: "2026-02-07T12:00:00.000Z",
      }),
    ]);

    expect(groups[0]?.sessionName).toBe("beta");
  });

  it("sorts panes by latest lastInputAt within a window", () => {
    const groups = buildSessionWindowGroups([
      buildSession({
        paneId: "%a1",
        sessionName: "alpha",
        windowIndex: 1,
        paneIndex: 0,
        lastInputAt: "2026-02-07T10:00:00.000Z",
      }),
      buildSession({
        paneId: "%a2",
        sessionName: "alpha",
        windowIndex: 1,
        paneIndex: 1,
        lastInputAt: "2026-02-07T11:00:00.000Z",
      }),
    ]);

    expect(groups[0]?.sessions.map((session) => session.paneId)).toEqual(["%a2", "%a1"]);
  });
});
