import { renderHook } from "@testing-library/react";
import type { SessionSummary } from "@vde-monitor/shared";
import { describe, expect, it } from "vitest";

import {
  buildFilteredSessionGroups,
  useSessionGroupingSelector,
} from "./useSessionGroupingSelector";

const buildSession = (overrides: Partial<SessionSummary> = {}): SessionSummary => ({
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

describe("buildFilteredSessionGroups", () => {
  it("filters sessions by filter and keeps group ordering with sort anchor", () => {
    const sessionGroups = [
      {
        repoRoot: "/repo/a",
        lastInputAt: "2026-02-17T00:00:00.000Z",
        sessions: [buildSession({ paneId: "%1", repoRoot: "/repo/a", state: "RUNNING" })],
      },
      {
        repoRoot: "/repo/b",
        lastInputAt: "2026-02-17T01:00:00.000Z",
        sessions: [buildSession({ paneId: "%2", repoRoot: "/repo/b", state: "RUNNING" })],
      },
    ];

    const groups = buildFilteredSessionGroups({
      sessionGroups,
      filter: "ALL",
      getRepoSortAnchorAt: (repoRoot) =>
        repoRoot === "/repo/a" ? Date.parse("2026-02-17T02:00:00.000Z") : null,
    });

    expect(groups.map((group) => group.repoRoot)).toEqual(["/repo/a", "/repo/b"]);
  });
});

describe("useSessionGroupingSelector", () => {
  it("builds visible/groups/sidebar/quick panel groups with shared selector", () => {
    const sessions = [
      buildSession({
        paneId: "%1",
        repoRoot: "/repo/a",
        state: "RUNNING",
        title: "backend",
        lastInputAt: "2026-02-17T00:00:00.000Z",
      }),
      buildSession({
        paneId: "%2",
        repoRoot: "/repo/b",
        state: "SHELL",
        title: "shell",
        lastInputAt: "2026-02-17T01:00:00.000Z",
      }),
    ];

    const { result } = renderHook(() =>
      useSessionGroupingSelector({
        sessions,
        filter: "ALL",
        searchQuery: "backend",
        matchesSearch: (session, query) => (session.title ?? "").includes(query),
      }),
    );

    expect(result.current.visibleSessions).toHaveLength(1);
    expect(result.current.groups).toHaveLength(1);
    expect(result.current.sidebarSessionGroups).toHaveLength(2);
    expect(result.current.quickPanelGroups).toHaveLength(1);
  });
});
