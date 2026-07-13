import type { SessionSummary } from "@vde-monitor/shared";
import { describe, expect, it } from "vitest";

import type { WorkspaceTab } from "../model/workspace-tabs";
import { buildPwaWorkspaceTabGroups, resolvePwaTabStateClass } from "./usePwaWorkspaceTabsVM";

const buildSession = (
  paneId: string,
  sessionId: string,
  overrides: Partial<SessionSummary> = {},
): SessionSummary => ({
  paneId,
  sessionId,
  windowId: `window-${sessionId}`,
  sessionName: "same-name",
  windowIndex: 0,
  paneIndex: 0,
  paneActive: true,
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

const buildTab = (paneId: string): WorkspaceTab => ({
  id: `session:${paneId}`,
  kind: "session",
  paneId,
  systemRoute: null,
  closable: true,
  lastActivatedAt: 0,
});

describe("resolvePwaTabStateClass", () => {
  it("maps every public session state without an ERROR fallback", () => {
    expect(resolvePwaTabStateClass("RUNNING")).toBe("bg-latte-green/85");
    expect(resolvePwaTabStateClass("WAITING_INPUT")).toBe("bg-latte-peach/85");
    expect(resolvePwaTabStateClass("WAITING_PERMISSION")).toBe("bg-latte-red/85");
    expect(resolvePwaTabStateClass("DONE")).toBe("bg-latte-blue/85");
    expect(resolvePwaTabStateClass("SHELL")).toBe("bg-latte-blue/85");
    expect(resolvePwaTabStateClass("UNKNOWN")).toBe("bg-latte-overlay0/80");
    expect(resolvePwaTabStateClass(null)).toBe("bg-latte-overlay0/80");
  });
});

describe("buildPwaWorkspaceTabGroups", () => {
  it("keeps same-name sessions separate by stable session id", () => {
    const sessions = [
      buildSession("surface-1", "workspace-1"),
      buildSession("surface-2", "workspace-2"),
    ];
    const groups = buildPwaWorkspaceTabGroups(
      [buildTab("surface-1"), buildTab("surface-2")],
      new Map(sessions.map((session) => [session.paneId, session])),
    );

    expect(groups.map(({ key, label }) => ({ key, label }))).toEqual([
      { key: "session:workspace-1", label: "SAME·1" },
      { key: "session:workspace-2", label: "SAME·2" },
    ]);
  });

  it("keeps duplicate-name labels attached to stable session ids after tab reorder", () => {
    const sessions = [
      buildSession("surface-1", "workspace-1"),
      buildSession("surface-2", "workspace-2"),
    ];
    const groups = buildPwaWorkspaceTabGroups(
      [buildTab("surface-2"), buildTab("surface-1")],
      new Map(sessions.map((session) => [session.paneId, session])),
    );

    expect(groups.map(({ key, label }) => ({ key, label }))).toEqual([
      { key: "session:workspace-2", label: "SAME·2" },
      { key: "session:workspace-1", label: "SAME·1" },
    ]);
  });

  it("uses the unique non-null repository name within a workspace", () => {
    const sessions = [
      buildSession("surface-1", "workspace-1", {
        sessionName: "command-codex",
        repoRoot: "/Users/dev/repos/vde-monitor",
      }),
      buildSession("surface-2", "workspace-1", {
        sessionName: "command-shell",
        repoRoot: null,
      }),
    ];
    const groups = buildPwaWorkspaceTabGroups(
      [buildTab("surface-1"), buildTab("surface-2")],
      new Map(sessions.map((session) => [session.paneId, session])),
    );

    expect(groups).toHaveLength(1);
    expect(groups[0]?.key).toBe("session:workspace-1");
    expect(groups[0]?.label).toBe("VDE-");
  });

  it("falls back to the session name when a workspace contains multiple repositories", () => {
    const sessions = [
      buildSession("surface-1", "workspace-1", {
        sessionName: "workspace-main",
        repoRoot: "/Users/dev/repos/repo-a",
      }),
      buildSession("surface-2", "workspace-1", {
        sessionName: "workspace-main",
        repoRoot: "/Users/dev/repos/repo-b",
      }),
    ];
    const groups = buildPwaWorkspaceTabGroups(
      [buildTab("surface-1")],
      new Map(sessions.map((session) => [session.paneId, session])),
    );

    expect(groups).toHaveLength(1);
    expect(groups[0]?.label).toBe("WORK");
  });

  it("keeps stable ordinals when different workspaces use the same repository name", () => {
    const sessions = [
      buildSession("surface-1", "workspace-1", {
        repoRoot: "/Users/dev/repos/vde-monitor",
      }),
      buildSession("surface-2", "workspace-2", {
        repoRoot: "/Users/dev/repos/vde-monitor",
      }),
    ];
    const groups = buildPwaWorkspaceTabGroups(
      [buildTab("surface-2"), buildTab("surface-1")],
      new Map(sessions.map((session) => [session.paneId, session])),
    );

    expect(groups.map(({ key, label }) => ({ key, label }))).toEqual([
      { key: "session:workspace-2", label: "VDE-·2" },
      { key: "session:workspace-1", label: "VDE-·1" },
    ]);
  });
});
