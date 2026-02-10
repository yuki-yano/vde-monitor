// @vitest-environment happy-dom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { buildSessionGroups } from "@/lib/session-group";

import { createSessionDetail } from "../test-helpers";
import { QuickPanel } from "./QuickPanel";

describe("QuickPanel", () => {
  type QuickPanelState = Parameters<typeof QuickPanel>[0]["state"];
  type QuickPanelActions = Parameters<typeof QuickPanel>[0]["actions"];

  const buildState = (overrides: Partial<QuickPanelState> = {}): QuickPanelState => ({
    open: true,
    sessionGroups: [],
    allSessions: [],
    nowMs: Date.now(),
    ...overrides,
  });

  const buildActions = (overrides: Partial<QuickPanelActions> = {}): QuickPanelActions => ({
    onOpenLogModal: vi.fn(),
    onOpenSessionLink: vi.fn(),
    onClose: vi.fn(),
    onToggle: vi.fn(),
    ...overrides,
  });

  it("renders toggle button when closed", () => {
    const onToggle = vi.fn();
    const state = buildState({ open: false });
    const actions = buildActions({ onToggle });
    render(<QuickPanel state={state} actions={actions} />);

    fireEvent.click(screen.getByLabelText("Toggle session quick panel"));
    expect(onToggle).toHaveBeenCalled();
  });

  it("renders empty state when no sessions", () => {
    const state = buildState({ open: true, sessionGroups: [] });
    const actions = buildActions();
    render(<QuickPanel state={state} actions={actions} />);

    expect(screen.getByText("No agent sessions available.")).toBeTruthy();
  });

  it("opens log modal for selected session", () => {
    const session = createSessionDetail();
    const onOpenLogModal = vi.fn();
    const state = buildState({
      open: true,
      sessionGroups: [
        {
          repoRoot: session.repoRoot,
          sessions: [session],
          lastInputAt: session.lastInputAt,
        },
      ],
      allSessions: [session],
    });
    const actions = buildActions({ onOpenLogModal });
    render(<QuickPanel state={state} actions={actions} />);

    fireEvent.click(screen.getByText("Session Title"));
    expect(onOpenLogModal).toHaveBeenCalledWith("pane-1");
  });

  it("opens session link directly from row action", () => {
    const session = createSessionDetail();
    const onOpenSessionLink = vi.fn();
    const state = buildState({
      open: true,
      sessionGroups: [
        {
          repoRoot: session.repoRoot,
          sessions: [session],
          lastInputAt: session.lastInputAt,
        },
      ],
      allSessions: [session],
    });
    const actions = buildActions({ onOpenSessionLink });
    render(<QuickPanel state={state} actions={actions} />);

    fireEvent.click(screen.getByLabelText("Open session link"));
    expect(onOpenSessionLink).toHaveBeenCalledWith("pane-1");
  });

  it("shows agent as icon only and displays branch on the right", () => {
    const session = createSessionDetail({
      agent: "codex",
      branch: "feature/quick-panel",
    });
    const state = buildState({
      open: true,
      sessionGroups: [
        {
          repoRoot: session.repoRoot,
          sessions: [session],
          lastInputAt: session.lastInputAt,
        },
      ],
      allSessions: [session],
    });
    const actions = buildActions();
    render(<QuickPanel state={state} actions={actions} />);

    expect(screen.getByText("feature/quick-panel")).toBeTruthy();
    expect(screen.getByLabelText("CODEX")).toBeTruthy();
    expect(screen.queryByText("CODEX")).toBeNull();
  });

  it("hides worktree flags for non-vw paths", () => {
    const session = createSessionDetail({
      agent: "codex",
      branch: "feature/non-worktree",
      worktreePath: "/Users/test/repo",
      worktreeDirty: true,
      worktreeLocked: true,
      worktreePrCreated: true,
      worktreeMerged: true,
    });
    const state = buildState({
      open: true,
      sessionGroups: [
        {
          repoRoot: session.repoRoot,
          sessions: [session],
          lastInputAt: session.lastInputAt,
        },
      ],
      allSessions: [session],
    });
    const actions = buildActions();
    render(<QuickPanel state={state} actions={actions} />);

    expect(screen.queryByText("D:Y")).toBeNull();
    expect(screen.queryByText("L:Y")).toBeNull();
    expect(screen.queryByText("PR:Y")).toBeNull();
    expect(screen.queryByText("M:Y")).toBeNull();
  });

  it("shows worktree flags for vw worktree paths", () => {
    const session = createSessionDetail({
      agent: "codex",
      branch: "feature/worktree",
      worktreePath: "/Users/test/repo/.worktree/feature/worktree",
      worktreeDirty: true,
      worktreeLocked: false,
      worktreePrCreated: true,
      worktreeMerged: false,
    });
    const state = buildState({
      open: true,
      sessionGroups: [
        {
          repoRoot: session.repoRoot,
          sessions: [session],
          lastInputAt: session.lastInputAt,
        },
      ],
      allSessions: [session],
    });
    const actions = buildActions();
    render(<QuickPanel state={state} actions={actions} />);

    expect(screen.getByText("D:Y")).toBeTruthy();
    expect(screen.getByText("L:N")).toBeTruthy();
    expect(screen.getByText("PR:Y")).toBeTruthy();
    expect(screen.getByText("M:N")).toBeTruthy();
  });

  it("keeps close button above row action buttons", () => {
    const session = createSessionDetail();
    const state = buildState({
      open: true,
      sessionGroups: [
        {
          repoRoot: session.repoRoot,
          sessions: [session],
          lastInputAt: session.lastInputAt,
        },
      ],
      allSessions: [session],
    });
    const actions = buildActions();
    render(<QuickPanel state={state} actions={actions} />);

    expect(screen.getByLabelText("Close quick panel").className).toContain("z-30");
    expect(screen.getByLabelText("Open session link").className).toContain("z-10");
  });

  it("uses window-level pane totals from all sessions", () => {
    const agentOne = createSessionDetail({
      paneId: "pane-1",
      agent: "codex",
      windowIndex: 1,
      paneIndex: 0,
      sessionName: "alpha",
    });
    const agentTwo = createSessionDetail({
      paneId: "pane-2",
      agent: "claude",
      windowIndex: 2,
      paneIndex: 0,
      sessionName: "alpha",
    });
    const shellOne = createSessionDetail({
      paneId: "pane-3",
      agent: "unknown",
      windowIndex: 1,
      paneIndex: 1,
      sessionName: "alpha",
    });
    const shellTwo = createSessionDetail({
      paneId: "pane-4",
      agent: "unknown",
      windowIndex: 1,
      paneIndex: 2,
      sessionName: "alpha",
    });
    const shellThree = createSessionDetail({
      paneId: "pane-5",
      agent: "unknown",
      windowIndex: 2,
      paneIndex: 1,
      sessionName: "alpha",
    });
    const allSessions = [agentOne, agentTwo, shellOne, shellTwo, shellThree];
    const state = buildState({
      open: true,
      sessionGroups: buildSessionGroups([agentOne, agentTwo]),
      allSessions,
    });
    const actions = buildActions();
    render(<QuickPanel state={state} actions={actions} />);

    expect(screen.getAllByText("1 / 3 panes").length).toBeGreaterThan(0);
    expect(screen.getAllByText("1 / 2 panes").length).toBeGreaterThan(0);
  });
});
