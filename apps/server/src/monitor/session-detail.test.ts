import { describe, expect, it } from "vitest";

import { type PaneSnapshot, buildSessionDetail } from "./session-detail";
import { hostCandidates } from "./monitor-utils";

const buildPane = (overrides: Partial<PaneSnapshot> = {}): PaneSnapshot => ({
  paneId: "1",
  sessionName: "main",
  windowIndex: 0,
  paneIndex: 1,
  windowActivity: null,
  paneActive: true,
  currentCommand: "bash",
  currentPath: "/Users/test/project",
  paneTty: "/dev/ttys001",
  paneTitle: null,
  paneStartCommand: "bash",
  panePid: 123,
  paneDead: false,
  alternateOn: false,
  ...overrides,
});

describe("buildSessionDetail", () => {
  it("uses pane title when available and not host", () => {
    const pane = buildPane({ paneTitle: "MyPane" });
    const detail = buildSessionDetail({
      pane,
      agent: "codex",
      state: "RUNNING",
      stateReason: "test",
      lastMessage: null,
      lastOutputAt: null,
      lastEventAt: null,
      lastInputAt: null,
      pipeAttached: true,
      pipeConflict: false,
      customTitle: null,
      branch: "main",
      worktreePath: "/Users/test/project",
      worktreeDirty: false,
      worktreeLocked: false,
      worktreeLockOwner: null,
      worktreeLockReason: null,
      worktreeMerged: false,
      repoRoot: "/Users/test/project",
    });
    expect(detail.title).toBe("MyPane");
    expect(detail.branch).toBe("main");
  });

  it("returns null title when pane title is absent", () => {
    const pane = buildPane({ paneTitle: null });
    const detail = buildSessionDetail({
      pane,
      agent: "claude",
      state: "WAITING_INPUT",
      stateReason: "test",
      lastMessage: null,
      lastOutputAt: null,
      lastEventAt: null,
      lastInputAt: null,
      pipeAttached: false,
      pipeConflict: false,
      customTitle: "Custom",
      repoRoot: null,
    });
    expect(detail.title).toBeNull();
    expect(detail.customTitle).toBe("Custom");
    expect(detail.branch).toBeNull();
  });

  it("keeps pane title when path is missing", () => {
    const pane = buildPane({ currentPath: null, paneTitle: "MyPane" });
    const detail = buildSessionDetail({
      pane,
      agent: "unknown",
      state: "UNKNOWN",
      stateReason: "test",
      lastMessage: "msg",
      lastOutputAt: "2024-01-01T00:00:00.000Z",
      lastEventAt: "2024-01-01T00:00:00.000Z",
      lastInputAt: null,
      pipeAttached: false,
      pipeConflict: true,
      customTitle: null,
      repoRoot: null,
    });
    expect(detail.title).toBe("MyPane");
    expect(detail.pipeConflict).toBe(true);
    expect(detail.lastMessage).toBe("msg");
  });

  it("treats host-like pane title as case-insensitive", () => {
    const hostTitle = [...hostCandidates][0] ?? "localhost";
    const pane = buildPane({ paneTitle: hostTitle.toUpperCase() });
    const detail = buildSessionDetail({
      pane,
      agent: "unknown",
      state: "UNKNOWN",
      stateReason: "test",
      lastMessage: null,
      lastOutputAt: null,
      lastEventAt: null,
      lastInputAt: null,
      pipeAttached: false,
      pipeConflict: false,
      customTitle: null,
      repoRoot: null,
    });
    expect(detail.title).toBeNull();
  });
});
