import type { SessionSummary } from "@vde-monitor/shared";
import { describe, expect, it } from "vitest";

import { buildSessionGroups } from "./session-group";

const buildSession = (overrides: Partial<SessionSummary>): SessionSummary => ({
  paneId: "%1",
  sessionId: "$1",
  sessionName: "main",
  windowId: "@1",
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
  lastRunStartedAt: null,
  manualSortAt: null,
  repoRoot: null,
  paneDead: false,
  alternateOn: false,
  pipeAttached: false,
  pipeConflict: false,
  completion: null,
  ...overrides,
});

describe("buildSessionGroups", () => {
  it("sorts groups by latest lastInputAt desc and puts no-repo last", () => {
    const sessions = [
      buildSession({
        paneId: "%1",
        repoRoot: "/repo/a",
        lastInputAt: "2026-02-01T00:00:00Z",
      }),
      buildSession({
        paneId: "%2",
        repoRoot: "/repo/b",
        lastInputAt: "2026-02-01T01:00:00Z",
      }),
      buildSession({
        paneId: "%3",
        repoRoot: "/repo/a",
        lastInputAt: null,
      }),
      buildSession({
        paneId: "%4",
        repoRoot: null,
        lastInputAt: null,
      }),
    ];

    const groups = buildSessionGroups(sessions);

    expect(groups.map((group) => group.repoRoot)).toEqual(["/repo/b", "/repo/a", null]);
  });

  it("sorts sessions within a group by the latest run, input, or manual timestamp", () => {
    const sessions = [
      buildSession({
        paneId: "%1",
        repoRoot: "/repo/a",
        lastInputAt: "2026-02-01T00:00:00Z",
        lastRunStartedAt: "2026-02-01T00:30:00Z",
      }),
      buildSession({
        paneId: "%2",
        repoRoot: "/repo/a",
        lastInputAt: "2026-02-01T00:00:00Z",
        manualSortAt: "2026-02-01T00:20:00Z",
      }),
      buildSession({
        paneId: "%3",
        repoRoot: "/repo/a",
        lastInputAt: null,
        lastOutputAt: "2026-02-01T01:00:00Z",
      }),
    ];

    const groups = buildSessionGroups(sessions);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.sessions.map((session) => session.paneId)).toEqual(["%1", "%2", "%3"]);
  });

  it("uses the newest descendant run to sort repository groups", () => {
    const groups = buildSessionGroups([
      buildSession({
        paneId: "%1",
        repoRoot: "/repo/a",
        lastInputAt: "2026-02-01T04:00:00Z",
      }),
      buildSession({
        paneId: "%2",
        repoRoot: "/repo/b",
        lastRunStartedAt: "2026-02-01T05:00:00Z",
      }),
    ]);

    expect(groups.map((group) => group.repoRoot)).toEqual(["/repo/b", "/repo/a"]);
  });

  it("uses the latest timestamp between sort anchor and input for group sorting", () => {
    const sessions = [
      buildSession({
        paneId: "%1",
        repoRoot: "/repo/a",
        lastInputAt: "2026-02-01T01:00:00Z",
      }),
      buildSession({
        paneId: "%2",
        repoRoot: "/repo/b",
        lastInputAt: "2026-02-01T02:00:00Z",
      }),
    ];

    const groups = buildSessionGroups(sessions, {
      getRepoSortAnchorAt: (repoRoot) =>
        repoRoot === "/repo/a" ? Date.parse("2026-02-01T03:00:00Z") : null,
    });

    expect(groups.map((group) => group.repoRoot)).toEqual(["/repo/a", "/repo/b"]);
  });

  it("does not keep repo anchor above fresher input when anchor timestamp is stale", () => {
    const sessions = [
      buildSession({
        paneId: "%1",
        repoRoot: "/repo/a",
        lastInputAt: "2026-02-01T01:00:00Z",
      }),
      buildSession({
        paneId: "%2",
        repoRoot: "/repo/b",
        lastInputAt: "2026-02-01T02:00:00Z",
      }),
    ];

    const groups = buildSessionGroups(sessions, {
      getRepoSortAnchorAt: (repoRoot) => (repoRoot === "/repo/a" ? 2000 : null),
    });

    expect(groups.map((group) => group.repoRoot)).toEqual(["/repo/b", "/repo/a"]);
  });
});
