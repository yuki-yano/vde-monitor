// @vitest-environment happy-dom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { SessionSummary } from "@vde-monitor/shared";
import { describe, expect, it, vi } from "vitest";

import { defaultLaunchConfig } from "@/state/launch-agent-options";

import { LaunchAgentButton } from "./launch-agent-button";

const buildSession = (overrides: Partial<SessionSummary> = {}): SessionSummary => ({
  paneId: "pane-1",
  sessionName: "session-1",
  windowIndex: 1,
  paneIndex: 0,
  windowActivity: null,
  paneActive: true,
  currentCommand: null,
  currentPath: "/repo",
  paneTty: null,
  title: "Session",
  customTitle: null,
  branch: "main",
  worktreePath: "/repo",
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

describe("LaunchAgentButton", () => {
  it("shows one-line default options and launches without override options by default", async () => {
    const requestWorktrees = vi.fn(async () => ({ repoRoot: "/repo", currentPath: "/repo", entries: [] }));
    const onLaunchAgentInSession = vi.fn(async () => undefined);
    const launchConfig = {
      ...defaultLaunchConfig,
      agents: {
        ...defaultLaunchConfig.agents,
        claude: { options: ["--dangerously-skip-permissions"] },
      },
    };

    render(
      <LaunchAgentButton
        sessionName="dev-main"
        sourceSession={buildSession()}
        launchConfig={launchConfig}
        launchPendingSessions={new Set()}
        requestWorktrees={requestWorktrees}
        onLaunchAgentInSession={onLaunchAgentInSession}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Launch Agent" }));
    fireEvent.click(screen.getByRole("button", { name: "Claude" }));
    const overrideCheckbox = screen.getByLabelText("Override agent options") as HTMLInputElement;
    expect(overrideCheckbox.checked).toBe(false);
    expect(screen.getByText("--dangerously-skip-permissions")).toBeTruthy();
    expect(screen.queryByLabelText("Agent options override")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Launch" }));

    await waitFor(() => {
      expect(onLaunchAgentInSession).toHaveBeenCalledWith("dev-main", "claude", {
        cwd: "/repo",
      });
    });
  });

  it("submits overridden agent options when override is enabled", async () => {
    const requestWorktrees = vi.fn(async () => ({ repoRoot: "/repo", currentPath: "/repo", entries: [] }));
    const onLaunchAgentInSession = vi.fn(async () => undefined);
    const launchConfig = {
      ...defaultLaunchConfig,
      agents: {
        ...defaultLaunchConfig.agents,
        claude: { options: ["--dangerously-skip-permissions"] },
      },
    };

    render(
      <LaunchAgentButton
        sessionName="dev-main"
        sourceSession={buildSession()}
        launchConfig={launchConfig}
        launchPendingSessions={new Set()}
        requestWorktrees={requestWorktrees}
        onLaunchAgentInSession={onLaunchAgentInSession}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Launch Agent" }));
    fireEvent.click(screen.getByRole("button", { name: "Claude" }));
    fireEvent.click(screen.getByLabelText("Override agent options"));
    expect(screen.getByText(/1 line = 1 argument/i)).toBeTruthy();
    const overrideInput = screen.getByLabelText("Agent options override");
    fireEvent.change(overrideInput, {
      target: { value: "--dangerously-skip-permissions\n--verbose" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Launch" }));

    await waitFor(() => {
      expect(onLaunchAgentInSession).toHaveBeenCalledWith("dev-main", "claude", {
        agentOptions: ["--dangerously-skip-permissions", "--verbose"],
        cwd: "/repo",
      });
    });
  });

  it("submits worktree create request in new mode", async () => {
    const requestWorktrees = vi.fn(async () => ({ repoRoot: "/repo", currentPath: "/repo", entries: [] }));
    const onLaunchAgentInSession = vi.fn(async () => undefined);

    render(
      <LaunchAgentButton
        sessionName="dev-main"
        sourceSession={buildSession({
          branch: "feature/current",
          worktreePath: "/repo/.worktree/feature/current",
        })}
        launchConfig={defaultLaunchConfig}
        launchPendingSessions={new Set()}
        requestWorktrees={requestWorktrees}
        onLaunchAgentInSession={onLaunchAgentInSession}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Launch Agent" }));
    await waitFor(() => {
      expect(requestWorktrees).toHaveBeenCalledWith("pane-1");
    });
    fireEvent.change(screen.getByPlaceholderText("feature/new-worktree"), {
      target: { value: "feature/new-pane" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Launch" }));

    await waitFor(() => {
      expect(onLaunchAgentInSession).toHaveBeenCalledWith("dev-main", "codex", {
        worktreeBranch: "feature/new-pane",
        worktreeCreateIfMissing: true,
      });
    });
  });

  it("submits selected existing worktree", async () => {
    const requestWorktrees = vi.fn(async () => ({
      repoRoot: "/repo",
      currentPath: "/repo/.worktree/feature/current",
      entries: [
        {
          path: "/repo/.worktree/feature/current",
          branch: "feature/current",
          dirty: false,
          locked: false,
          lockOwner: null,
          lockReason: null,
          merged: false,
        },
        {
          path: "/repo/.worktree/feature/next",
          branch: "feature/next",
          dirty: false,
          locked: false,
          lockOwner: null,
          lockReason: null,
          merged: false,
        },
      ],
    }));
    const onLaunchAgentInSession = vi.fn(async () => undefined);

    render(
      <LaunchAgentButton
        sessionName="dev-main"
        sourceSession={buildSession({
          branch: "feature/current",
          worktreePath: "/repo/.worktree/feature/current",
        })}
        launchConfig={defaultLaunchConfig}
        launchPendingSessions={new Set()}
        requestWorktrees={requestWorktrees}
        onLaunchAgentInSession={onLaunchAgentInSession}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Launch Agent" }));
    await waitFor(() => {
      expect(screen.getByText("feature/next")).toBeTruthy();
      expect(screen.getByText(".worktree/feature/next")).toBeTruthy();
    });
    fireEvent.click(screen.getByRole("radio", { name: /feature\/next/i }));
    fireEvent.click(screen.getByRole("button", { name: "Launch" }));

    await waitFor(() => {
      expect(onLaunchAgentInSession).toHaveBeenCalledWith("dev-main", "codex", {
        worktreePath: "/repo/.worktree/feature/next",
        worktreeBranch: "feature/next",
      });
    });
  });

  it("defaults worktree mode to existing when enabling vw worktree", async () => {
    const requestWorktrees = vi.fn(async () => ({
      repoRoot: "/repo",
      currentPath: "/repo/.worktree/feature/current",
      entries: [
        {
          path: "/repo/.worktree/feature/current",
          branch: "feature/current",
          dirty: false,
          locked: false,
          lockOwner: null,
          lockReason: null,
          merged: false,
        },
      ],
    }));
    const onLaunchAgentInSession = vi.fn(async () => undefined);

    render(
      <LaunchAgentButton
        sessionName="dev-main"
        sourceSession={buildSession({ paneId: "pane-root", worktreePath: "/repo", branch: "main" })}
        launchConfig={defaultLaunchConfig}
        launchPendingSessions={new Set()}
        requestWorktrees={requestWorktrees}
        onLaunchAgentInSession={onLaunchAgentInSession}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Launch Agent" }));
    fireEvent.click(screen.getByLabelText("Use vw worktree"));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Existing" })).toBeTruthy();
      expect(screen.getByRole("radio", { name: /feature\/current/i })).toBeTruthy();
    });
    expect(screen.queryByPlaceholderText("feature/new-worktree")).toBeNull();
  });

  it("keeps launch location selection while modal is open even if source session updates", async () => {
    const requestWorktrees = vi.fn(async () => ({ repoRoot: "/repo", currentPath: "/repo", entries: [] }));
    const onLaunchAgentInSession = vi.fn(async () => undefined);
    const { rerender } = render(
      <LaunchAgentButton
        sessionName="dev-main"
        sourceSession={buildSession({ paneId: "pane-root", worktreePath: "/repo", branch: "main" })}
        launchConfig={defaultLaunchConfig}
        launchPendingSessions={new Set()}
        requestWorktrees={requestWorktrees}
        onLaunchAgentInSession={onLaunchAgentInSession}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Launch Agent" }));
    fireEvent.click(screen.getByLabelText("Use vw worktree"));
    await waitFor(() => {
      expect(screen.getByPlaceholderText("feature/new-worktree")).toBeTruthy();
    });

    rerender(
      <LaunchAgentButton
        sessionName="dev-main"
        sourceSession={buildSession({
          paneId: "pane-worktree",
          worktreePath: "/repo/.worktree/feature/other",
          branch: "feature/other",
        })}
        launchConfig={defaultLaunchConfig}
        launchPendingSessions={new Set()}
        requestWorktrees={requestWorktrees}
        onLaunchAgentInSession={onLaunchAgentInSession}
      />,
    );

    expect(screen.getByPlaceholderText("feature/new-worktree")).toBeTruthy();
    expect(screen.queryByText("repo root: /repo")).toBeNull();
  });

  it("keeps edited agent options while modal is open even if launch config updates", () => {
    const requestWorktrees = vi.fn(async () => ({ repoRoot: "/repo", currentPath: "/repo", entries: [] }));
    const onLaunchAgentInSession = vi.fn(async () => undefined);
    const initialLaunchConfig = {
      ...defaultLaunchConfig,
      agents: {
        ...defaultLaunchConfig.agents,
        codex: { options: ["--initial"] },
      },
    };
    const nextLaunchConfig = {
      ...defaultLaunchConfig,
      agents: {
        ...defaultLaunchConfig.agents,
        codex: { options: ["--updated"] },
      },
    };
    const { rerender } = render(
      <LaunchAgentButton
        sessionName="dev-main"
        sourceSession={buildSession({ paneId: "pane-root", worktreePath: "/repo", branch: "main" })}
        launchConfig={initialLaunchConfig}
        launchPendingSessions={new Set()}
        requestWorktrees={requestWorktrees}
        onLaunchAgentInSession={onLaunchAgentInSession}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Launch Agent" }));
    fireEvent.click(screen.getByLabelText("Override agent options"));
    const optionsInput = screen.getByLabelText("Agent options override");
    fireEvent.change(optionsInput, { target: { value: "--custom-edited" } });

    rerender(
      <LaunchAgentButton
        sessionName="dev-main"
        sourceSession={buildSession({ paneId: "pane-root", worktreePath: "/repo", branch: "main" })}
        launchConfig={nextLaunchConfig}
        launchPendingSessions={new Set()}
        requestWorktrees={requestWorktrees}
        onLaunchAgentInSession={onLaunchAgentInSession}
      />,
    );

    expect((screen.getByLabelText("Agent options override") as HTMLTextAreaElement).value).toBe(
      "--custom-edited",
    );
  });

  it("renders repo root with tilde when under home path", () => {
    const requestWorktrees = vi.fn(async () => ({ repoRoot: "/Users/test/repo", currentPath: null, entries: [] }));
    const onLaunchAgentInSession = vi.fn(async () => undefined);

    render(
      <LaunchAgentButton
        sessionName="dev-main"
        sourceSession={buildSession({
          worktreePath: "/Users/test/repo",
          repoRoot: "/Users/test/repo",
        })}
        launchConfig={defaultLaunchConfig}
        launchPendingSessions={new Set()}
        requestWorktrees={requestWorktrees}
        onLaunchAgentInSession={onLaunchAgentInSession}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Launch Agent" }));

    expect(screen.getByText("repo root: ~/repo")).toBeTruthy();
  });
});
