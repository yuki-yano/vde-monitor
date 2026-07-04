import { describe, expect, it, vi } from "vitest";

import { createHerdrLaunchCapability } from "./launch";
import { HERDR_METHODS } from "./methods";

describe("createHerdrLaunchCapability", () => {
  it("starts an agent in an existing herdr workspace", async () => {
    const client = {
      request: vi
        .fn()
        .mockResolvedValueOnce({
          workspaces: [{ workspace_id: "wD", label: "work" }],
        })
        .mockResolvedValueOnce({
          pane: { pane_id: "wD:p2", tab_id: "wD:t1", workspace_id: "wD", agent: "claude" },
        }),
    };
    const runCommand = vi.fn(async () => ({
      stdout: JSON.stringify({
        result: {
          agent: {
            pane_id: "wD:p2",
            tab_id: "wD:t1",
            workspace_id: "wD",
          },
        },
      }),
      stderr: "",
    }));

    const launch = createHerdrLaunchCapability({
      client,
      runCommand,
      resolveExecutable: async (agent) => [agent],
    });
    const result = await launch.launchAgentInSession({
      sessionName: "wD",
      agent: "claude",
      windowName: "claude-work",
      cwd: "/repo",
      agentOptions: ["--dangerously-skip-permissions"],
    });

    expect(result).toEqual({
      ok: true,
      result: {
        sessionName: "wD",
        agent: "claude",
        windowId: "wD:t1",
        windowIndex: 1,
        windowName: "claude-work",
        paneId: "wD:p2",
        launchedCommand: "claude",
        resolvedOptions: ["--dangerously-skip-permissions"],
        verification: {
          status: "verified",
          observedCommand: "claude",
          attempts: 1,
        },
      },
      rollback: { attempted: false, ok: true },
    });
    expect(client.request).toHaveBeenNthCalledWith(1, HERDR_METHODS.workspaceList, {});
    expect(client.request).toHaveBeenNthCalledWith(2, HERDR_METHODS.paneGet, {
      pane_id: "wD:p2",
    });
    expect(runCommand).toHaveBeenCalledWith([
      "agent",
      "start",
      "claude-work",
      "--workspace",
      "wD",
      "--cwd",
      "/repo",
      "--focus",
      "--",
      "claude",
      "--dangerously-skip-permissions",
    ]);
  });

  it("returns NOT_FOUND when the workspace is missing", async () => {
    const launch = createHerdrLaunchCapability({
      client: { request: vi.fn().mockResolvedValue({ workspaces: [] }) },
      runCommand: vi.fn(),
      resolveExecutable: async (agent) => [agent],
    });

    await expect(
      launch.launchAgentInSession({
        sessionName: "missing",
        agent: "codex",
      }),
    ).resolves.toEqual({
      ok: false,
      error: { code: "NOT_FOUND", message: "workspace not found: missing" },
      rollback: { attempted: false, ok: true },
    });
  });

  it("builds resume argv for codex", async () => {
    const client = {
      request: vi
        .fn()
        .mockResolvedValueOnce({ workspaces: [{ workspace_id: "wD" }] })
        .mockResolvedValueOnce({ pane: { pane_id: "wD:p2", tab_id: "wD:t1", agent: "codex" } }),
    };
    const runCommand = vi.fn(async () => ({
      stdout: JSON.stringify({
        result: { agent: { pane_id: "wD:p2", tab_id: "wD:t1", workspace_id: "wD" } },
      }),
      stderr: "",
    }));
    const launch = createHerdrLaunchCapability({
      client,
      runCommand,
      resolveExecutable: async (agent) => [agent],
    });

    await launch.launchAgentInSession({
      sessionName: "wD",
      agent: "codex",
      resumeSessionId: "session-1",
      agentOptions: ["--yolo"],
    });

    expect(runCommand).toHaveBeenCalledWith([
      "agent",
      "start",
      "codex-work",
      "--workspace",
      "wD",
      "--focus",
      "--",
      "codex",
      "resume",
      "session-1",
      "--yolo",
    ]);
  });

  it("uses configured launch options when request options are omitted", async () => {
    const client = {
      request: vi
        .fn()
        .mockResolvedValueOnce({ workspaces: [{ workspace_id: "wD" }] })
        .mockResolvedValueOnce({ pane: { pane_id: "wD:p2", tab_id: "wD:t1", agent: "codex" } }),
    };
    const runCommand = vi.fn(async () => ({
      stdout: JSON.stringify({
        result: { agent: { pane_id: "wD:p2", tab_id: "wD:t1", workspace_id: "wD" } },
      }),
      stderr: "",
    }));
    const launch = createHerdrLaunchCapability({
      client,
      config: {
        launch: {
          agents: {
            codex: { options: ["--yolo"] },
            claude: { options: ["--dangerously-skip-permissions"] },
          },
        },
      },
      runCommand,
      resolveExecutable: async (agent) => [agent],
    });

    await launch.launchAgentInSession({
      sessionName: "wD",
      agent: "codex",
    });

    expect(runCommand).toHaveBeenCalledWith([
      "agent",
      "start",
      "codex-work",
      "--workspace",
      "wD",
      "--focus",
      "--",
      "codex",
      "--yolo",
    ]);
  });

  it("resolves worktreeBranch to a cwd before starting an agent", async () => {
    const client = {
      request: vi
        .fn()
        .mockResolvedValueOnce({ workspaces: [{ workspace_id: "wD" }] })
        .mockResolvedValueOnce({
          panes: [{ workspace_id: "wD", foreground_cwd: "/repo" }],
        })
        .mockResolvedValueOnce({ pane: { pane_id: "wD:p2", tab_id: "wD:t1", agent: "codex" } }),
    };
    const runCommand = vi.fn(async () => ({
      stdout: JSON.stringify({
        result: { agent: { pane_id: "wD:p2", tab_id: "wD:t1", workspace_id: "wD" } },
      }),
      stderr: "",
    }));
    const runVw = vi.fn(async () => ({
      exitCode: 0,
      stdout: JSON.stringify({
        status: "ok",
        repoRoot: "/repo",
        worktrees: [
          { path: "/repo", branch: "main" },
          { path: "/repo/.worktree/feature-a", branch: "feature/a" },
        ],
      }),
      stderr: "",
    }));
    const launch = createHerdrLaunchCapability({
      client,
      runCommand,
      runVw,
      resolveExecutable: async (agent) => [agent],
    });

    await launch.launchAgentInSession({
      sessionName: "wD",
      agent: "codex",
      worktreeBranch: "feature/a",
    });

    expect(client.request).toHaveBeenNthCalledWith(2, HERDR_METHODS.paneList, {});
    expect(runVw).toHaveBeenCalledWith(["list", "--json", "--no-gh"], {
      cwd: "/repo",
      timeoutMs: 4000,
    });
    expect(runCommand).toHaveBeenCalledWith([
      "agent",
      "start",
      "codex-work",
      "--workspace",
      "wD",
      "--cwd",
      "/repo/.worktree/feature-a",
      "--focus",
      "--",
      "codex",
    ]);
  });

  it("creates a missing worktree through vw switch before starting an agent", async () => {
    const client = {
      request: vi
        .fn()
        .mockResolvedValueOnce({ workspaces: [{ workspace_id: "wD" }] })
        .mockResolvedValueOnce({
          panes: [{ workspace_id: "wD", cwd: "/repo" }],
        })
        .mockResolvedValueOnce({ pane: { pane_id: "wD:p2", tab_id: "wD:t1", agent: "claude" } }),
    };
    const runCommand = vi.fn(async () => ({
      stdout: JSON.stringify({
        result: { agent: { pane_id: "wD:p2", tab_id: "wD:t1", workspace_id: "wD" } },
      }),
      stderr: "",
    }));
    const runVw = vi.fn(async (args: string[]) => {
      if (args[0] === "list") {
        return {
          exitCode: 0,
          stdout: JSON.stringify({
            status: "ok",
            repoRoot: "/repo",
            worktrees: [{ path: "/repo", branch: "main" }],
          }),
          stderr: "",
        };
      }
      if (args[0] === "branch") {
        return { exitCode: 0, stdout: "main\n", stderr: "" };
      }
      if (args[0] === "switch") {
        return { exitCode: 0, stdout: "", stderr: "" };
      }
      return { exitCode: 0, stdout: "/repo/.worktree/feature-new\n", stderr: "" };
    });
    const launch = createHerdrLaunchCapability({
      client,
      runCommand,
      runVw,
      resolveExecutable: async (agent) => [agent],
    });

    await launch.launchAgentInSession({
      sessionName: "wD",
      agent: "claude",
      worktreeBranch: "feature/new",
      worktreeCreateIfMissing: true,
    });

    expect(runVw).toHaveBeenNthCalledWith(2, ["branch", "--show-current"], {
      cwd: "/repo",
      timeoutMs: 5000,
    });
    expect(runVw).toHaveBeenNthCalledWith(3, ["switch", "feature/new"], {
      cwd: "/repo",
      timeoutMs: 15_000,
    });
    expect(runVw).toHaveBeenNthCalledWith(4, ["path", "feature/new"], {
      cwd: "/repo",
      timeoutMs: 5000,
    });
    expect(runCommand).toHaveBeenCalledWith([
      "agent",
      "start",
      "claude-work",
      "--workspace",
      "wD",
      "--cwd",
      "/repo/.worktree/feature-new",
      "--focus",
      "--",
      "claude",
    ]);
  });
});
