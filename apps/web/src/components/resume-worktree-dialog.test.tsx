import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { SessionSummary } from "@vde-monitor/shared";
import { describe, expect, it, vi } from "vitest";

import { defaultLaunchConfig } from "@/state/launch-agent-options";

import { ResumeWorktreeDialog } from "./resume-worktree-dialog";

const buildSession = (overrides: Partial<SessionSummary> = {}): SessionSummary => ({
  paneId: "pane-1",
  sessionName: "session-1",
  windowIndex: 1,
  paneIndex: 0,
  windowActivity: null,
  paneActive: true,
  currentCommand: "codex",
  currentPath: "/repo/.worktree/feature/current",
  paneTty: null,
  title: "Session",
  customTitle: null,
  branch: "feature/current",
  worktreePath: "/repo/.worktree/feature/current",
  repoRoot: "/repo",
  agent: "codex",
  state: "RUNNING",
  stateReason: "running",
  lastMessage: null,
  lastOutputAt: null,
  lastEventAt: null,
  lastInputAt: null,
  paneDead: false,
  alternateOn: false,
  pipeAttached: false,
  pipeConflict: false,
  ...overrides,
});

describe("ResumeWorktreeDialog", () => {
  it("submits existing worktree resume request with source pane defaults", async () => {
    const onLaunchAgentInSession = vi.fn(async () => undefined);

    render(
      <ResumeWorktreeDialog
        open={true}
        onOpenChange={() => undefined}
        sessionName="dev-main"
        sourceSession={buildSession()}
        launchConfig={defaultLaunchConfig}
        worktreeEntries={[
          {
            path: "/repo/.worktree/feature/current",
            branch: "feature/current",
            dirty: false,
            locked: false,
            lockOwner: null,
            lockReason: null,
            merged: false,
          },
        ]}
        worktreeRepoRoot="/repo"
        onLaunchAgentInSession={onLaunchAgentInSession}
      />,
    );

    expect(screen.queryByText("Reuse Existing Session")).toBeNull();
    expect(screen.queryByRole("button", { name: "Codex" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Claude" })).toBeNull();
    expect(screen.queryByRole("checkbox", { name: "Use vw worktree" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Existing" })).toBeNull();
    expect(screen.queryByRole("button", { name: "New" })).toBeNull();
    expect(screen.getByText("Select existing vw worktree.")).toBeTruthy();
    expect(screen.queryByText(/repo root:/)).toBeNull();
    expect(screen.queryByRole("radio", { name: /Best effort/i })).toBeNull();
    expect(screen.queryByRole("radio", { name: /Required/i })).toBeNull();
    expect(
      screen.getByText("Existing session reuse is always enabled for this action."),
    ).toBeTruthy();
    expect(screen.getByText("Current agent:")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Resume / Move" }));

    await waitFor(() => {
      expect(onLaunchAgentInSession).toHaveBeenCalledWith("dev-main", "codex", {
        worktreePath: "/repo/.worktree/feature/current",
        worktreeBranch: "feature/current",
        resumeFromPaneId: "pane-1",
      });
    });
  });

  it("keeps source pane when Session ID override is set", async () => {
    const onLaunchAgentInSession = vi.fn(async () => undefined);

    render(
      <ResumeWorktreeDialog
        open={true}
        onOpenChange={() => undefined}
        sessionName="dev-main"
        sourceSession={buildSession()}
        launchConfig={defaultLaunchConfig}
        worktreeEntries={[
          {
            path: "/repo/.worktree/feature/current",
            branch: "feature/current",
            dirty: false,
            locked: false,
            lockOwner: null,
            lockReason: null,
            merged: false,
          },
        ]}
        worktreeRepoRoot="/repo"
        onLaunchAgentInSession={onLaunchAgentInSession}
      />,
    );

    fireEvent.change(screen.getByLabelText("Session ID override"), {
      target: { value: "sess-override-1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Resume / Move" }));

    await waitFor(() => {
      expect(onLaunchAgentInSession).toHaveBeenCalledWith("dev-main", "codex", {
        worktreePath: "/repo/.worktree/feature/current",
        worktreeBranch: "feature/current",
        resumeSessionId: "sess-override-1",
        resumeFromPaneId: "pane-1",
      });
    });
  });

  it("hides existing session inputs for claude and submits with source pane", async () => {
    const onLaunchAgentInSession = vi.fn(async () => undefined);

    render(
      <ResumeWorktreeDialog
        open={true}
        onOpenChange={() => undefined}
        sessionName="dev-main"
        sourceSession={buildSession({
          agent: "claude",
        })}
        launchConfig={defaultLaunchConfig}
        worktreeEntries={[
          {
            path: "/repo/.worktree/feature/current",
            branch: "feature/current",
            dirty: false,
            locked: false,
            lockOwner: null,
            lockReason: null,
            merged: false,
          },
        ]}
        worktreeRepoRoot="/repo"
        onLaunchAgentInSession={onLaunchAgentInSession}
      />,
    );

    expect(screen.queryByLabelText("Source Pane")).toBeNull();
    expect(screen.queryByLabelText("Session ID override")).toBeNull();
    expect(screen.queryByText("Agent Options")).toBeNull();
    expect(screen.queryByText("Current agent:")).toBeNull();
    expect(screen.getByText("Claude keeps using the same pane for this action.")).toBeTruthy();
    expect(screen.getByText("Session ID override is not required.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Resume / Move" }));

    await waitFor(() => {
      expect(onLaunchAgentInSession).toHaveBeenCalledWith("dev-main", "claude", {
        worktreePath: "/repo/.worktree/feature/current",
        worktreeBranch: "feature/current",
        resumeFromPaneId: "pane-1",
      });
    });
  });

  it("shows required failure reason from resume metadata", async () => {
    const onLaunchAgentInSession = vi.fn(async () => ({
      ok: false as const,
      error: { code: "RESUME_AMBIGUOUS" as const, message: "ambiguous" },
      rollback: { attempted: false, ok: true },
      resume: {
        requested: true,
        reused: false,
        sessionId: null,
        source: null,
        confidence: "none" as const,
        policy: "required" as const,
        failureReason: "ambiguous" as const,
      },
    }));

    render(
      <ResumeWorktreeDialog
        open={true}
        onOpenChange={() => undefined}
        sessionName="dev-main"
        sourceSession={buildSession()}
        launchConfig={defaultLaunchConfig}
        worktreeEntries={[
          {
            path: "/repo/.worktree/feature/current",
            branch: "feature/current",
            dirty: false,
            locked: false,
            lockOwner: null,
            lockReason: null,
            merged: false,
          },
        ]}
        worktreeRepoRoot="/repo"
        onLaunchAgentInSession={onLaunchAgentInSession}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Resume / Move" }));

    await waitFor(() => {
      expect(
        screen.getByText(
          "Multiple candidate sessions matched. Specify Session ID override or narrow Source Pane.",
        ),
      ).toBeTruthy();
    });
  });

  it("disables resume submit when no existing vw worktree is available", () => {
    const onLaunchAgentInSession = vi.fn(async () => undefined);

    render(
      <ResumeWorktreeDialog
        open={true}
        onOpenChange={() => undefined}
        sessionName="dev-main"
        sourceSession={buildSession()}
        launchConfig={defaultLaunchConfig}
        worktreeEntries={[]}
        worktreeRepoRoot="/repo"
        onLaunchAgentInSession={onLaunchAgentInSession}
      />,
    );

    const submitButton = screen.getByRole("button", { name: "Resume / Move" }) as HTMLButtonElement;
    expect(submitButton.disabled).toBe(true);

    fireEvent.click(submitButton);
    expect(onLaunchAgentInSession).not.toHaveBeenCalled();
  });
});
