// @vitest-environment happy-dom
import { fireEvent, render, screen } from "@testing-library/react";
import type { SessionSummary } from "@vde-monitor/shared";
import { describe, expect, it, vi } from "vitest";

import { ChatGridCandidateModal } from "./ChatGridCandidateModal";

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

describe("ChatGridCandidateModal", () => {
  it("disables apply when selected count is below minimum", () => {
    render(
      <ChatGridCandidateModal
        open
        candidateItems={[buildSession({ paneId: "pane-1" }), buildSession({ paneId: "pane-2" })]}
        selectedPaneIds={["pane-1"]}
        nowMs={Date.parse("2026-02-17T00:10:00.000Z")}
        onOpenChange={vi.fn()}
        onTogglePane={vi.fn()}
        onApply={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Apply" })).toHaveProperty("disabled", true);
    expect(screen.getByText("Select between 2 and 6 panes.")).toBeTruthy();
  });

  it("emits toggle and apply actions", () => {
    const onTogglePane = vi.fn();
    const onApply = vi.fn();
    render(
      <ChatGridCandidateModal
        open
        candidateItems={[
          buildSession({ paneId: "pane-1", title: "First Session" }),
          buildSession({ paneId: "pane-2", title: "Second Session" }),
          buildSession({ paneId: "pane-3", title: "Third Session" }),
        ]}
        selectedPaneIds={["pane-1", "pane-2"]}
        nowMs={Date.parse("2026-02-17T00:10:00.000Z")}
        onOpenChange={vi.fn()}
        onTogglePane={onTogglePane}
        onApply={onApply}
      />,
    );

    fireEvent.click(screen.getByLabelText("Select First Session"));
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));

    expect(onTogglePane).toHaveBeenCalledWith("pane-1");
    expect(onApply).toHaveBeenCalledTimes(1);
  });

  it("filters candidates by session and window fields", () => {
    render(
      <ChatGridCandidateModal
        open
        candidateItems={[
          buildSession({
            paneId: "pane-1",
            title: "First Session",
            sessionName: "alpha-session",
            windowIndex: 3,
          }),
          buildSession({
            paneId: "pane-2",
            title: "Second Session",
            sessionName: "beta-session",
            windowIndex: 8,
          }),
        ]}
        selectedPaneIds={[]}
        nowMs={Date.parse("2026-02-17T00:10:00.000Z")}
        onOpenChange={vi.fn()}
        onTogglePane={vi.fn()}
        onApply={vi.fn()}
      />,
    );

    const searchInput = screen.getByLabelText("Filter candidate panes");
    fireEvent.change(searchInput, { target: { value: "beta-session" } });

    expect(screen.queryByLabelText("Select First Session")).toBeNull();
    expect(screen.getByLabelText("Select Second Session")).toBeTruthy();

    fireEvent.change(searchInput, { target: { value: "window 3" } });

    expect(screen.getByLabelText("Select First Session")).toBeTruthy();
    expect(screen.queryByLabelText("Select Second Session")).toBeNull();
  });
});
