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
    onOpenSessionLinkInNewWindow: vi.fn(),
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

  it("opens session link in new window from row action", () => {
    const session = createSessionDetail();
    const onOpenSessionLinkInNewWindow = vi.fn();
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
    const actions = buildActions({ onOpenSessionLinkInNewWindow });
    render(<QuickPanel state={state} actions={actions} />);

    fireEvent.click(screen.getByLabelText("Open session link in new window"));
    expect(onOpenSessionLinkInNewWindow).toHaveBeenCalledWith("pane-1");
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

  it("hides worktree flags for vw worktree paths", () => {
    const session = createSessionDetail({
      agent: "codex",
      branch: "feature/worktree",
      worktreePath: "/Users/test/repo/.worktree/feature/worktree",
      worktreeDirty: true,
      worktreeLocked: false,
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

    expect(screen.queryByText("D:Y")).toBeNull();
    expect(screen.queryByText("L:N")).toBeNull();
    expect(screen.queryByText("PR:Y")).toBeNull();
    expect(screen.queryByText("M:N")).toBeNull();
  });

  it("closes when clicking outside quick panel", () => {
    const onClose = vi.fn();
    const state = buildState({ open: true, sessionGroups: [] });
    const actions = buildActions({ onClose });
    render(<QuickPanel state={state} actions={actions} />);

    fireEvent.pointerDown(document.body);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not close when clicking inside quick panel", () => {
    const onClose = vi.fn();
    const state = buildState({ open: true, sessionGroups: [] });
    const actions = buildActions({ onClose });
    render(<QuickPanel state={state} actions={actions} />);

    fireEvent.pointerDown(screen.getByText("No agent sessions available."));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("does not close when clicking inside log modal overlay", () => {
    const onClose = vi.fn();
    const state = buildState({ open: true, sessionGroups: [] });
    const actions = buildActions({ onClose });
    render(<QuickPanel state={state} actions={actions} />);

    const overlay = document.createElement("div");
    overlay.setAttribute("data-log-modal-overlay", "");
    const button = document.createElement("button");
    overlay.append(button);
    document.body.append(overlay);

    fireEvent.pointerDown(button);
    expect(onClose).not.toHaveBeenCalled();

    overlay.remove();
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
